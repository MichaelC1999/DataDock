import axios from "axios";
import { fetchAndPrintJavaScript, resolveAlerts } from "./helpers.js";

const args = process.argv.slice(2)

const USER = (args[0] === "0" || !args[0]) ? "" : args[0]
const MSG_SCRIPT_URI = (args[1] === "0" || !args[1]) ? "" : args[1] // This URI points to a js script is for building a custom output data object
const OUTPUT = (args[2] === "0" || !args[2]) ? "EXT" : args[2] // Options are "INT", "EXT", "TRANSACTION", "SOCKET", "CUSTOM"
const OUTPUT_URI = (args[3] === "0" || !args[3]) ? "" : args[3] // Internal/External/Socket URI that the output fetches/connects to
const OUTPUT_OPTIONS = (args[4] === "0" || !args[4]) ? "{}" : args[4]
const SCORE_CALCULATION_URI = (args[5] === "0" || !args[5]) ? "" : args[5] //This URI points to a js script is for custom score calculation. Script has access to tx, protocolData, userScore, USER, returnObj from the context

const argsObj = { USER, MSG_SCRIPT_URI, OUTPUT, OUTPUT_URI, OUTPUT_OPTIONS }

const returnObject = { messages: [], user: USER }

const subgraphsToQuery = [
    { slug: "compound-v3-arbitrum", type: "lending" },
    { slug: "compound-v3-ethereum", type: "lending" },
    { slug: "aave-v3-ethereum", type: "lending" },
    { slug: "aave-v3-polygon", type: "lending" },
    { slug: "aave-v3-optimism", type: "lending" },
    { slug: "aave-v3-arbitrum", type: "lending" },
    { slug: "uniswap-v3-ethereum", type: "dex" },
    { slug: "uniswap-v3-arbitrum", type: "dex" },
    { slug: "uniswap-v3-polygon", type: "dex" },
    { slug: "uniswap-v3-optimism", type: "dex" },
    { slug: "sushiswap-v3-ethereum", type: "dex" },
    { slug: "sushiswap-v3-arbitrum", type: "dex" },
    { slug: "sushiswap-v3-polygon", type: "dex" },
    { slug: "sushiswap-v3-optimism", type: "dex" }
]

const getMarketData = async (uri, type) => {
    try {
        const lendingQuery = {
            "operationName": "Positions",
            "query": `
            query Positions($connectedAddress: String) {
                protocols {
                    slug
                    network
                }
                positions(where: {account: $connectedAddress}) {
                    id
                    balance
                    principal
                    asset {
                        id
                        name
                        decimals
                    }
                    snapshots {
                        timestamp
                        balance
                        balanceUSD
                    }
                    blockNumberClosed
                    blockNumberOpened
                    withdrawCount
                    depositCount
                    liquidationCount
                    side
                }
            }`,
            "variables": { connectedAddress: USER }
        };

        const dexQuery = {
            "operationName": "Swaps",
            "query": `
            query Swaps($connectedAddress: String) {
                protocols {
                    slug
                    network
                  }
                account(id: $connectedAddress) {
                    swaps {
                        amountInUSD
                        amountOutUSD
                  }
                }
            }`,
            "variables": { connectedAddress: USER }
        }

        let queryToUse = lendingQuery
        if (type === 'dex') {
            queryToUse = dexQuery
        }

        const response = await axios({
            url: uri,
            method: 'post',
            headers: {
                "Content-Type": "application/json",
            },
            data: queryToUse
        });

        const curPositionData = response.data.data;
        return curPositionData;

    } catch (err) {
        console.log("Error caught - ", err.message);
        return {};
    }
}

const getAddressHistory = async () => {
    const query = `
    query UserBalanceChanges($connectedAddress: String) {
        balanceChanges(first: 1000, where: {owner: $connectedAddress}) {
            id
          contract
          owner
          oldBalance
          newBalance
          transaction
          transferValue
        }
      }`

    const balanceChangesReq = {
        "operationName": "UserBalanceChanges",
        "query": query,
        "variables": { connectedAddress: USER.split("0x").join("") }
    }
    const response = await axios({
        url: "https://api.studio.thegraph.com/query/32070/erc20-balances/version/latest",
        method: 'post',
        headers: {
            "Content-Type": "application/json",
        },
        data: balanceChangesReq
    });


    return response.data.data.balanceChanges
}

const getUserTransactions = async (txArray) => {
    const query = `
    query UserTransactions($txArray: [String!]) {
        balanceChanges(first: 1000, where: {transaction_in: $txArray}) {
            id
          contract
          owner
          oldBalance
          newBalance
          transaction
          transferValue
        }
      }`

    const balanceChangesReq = {
        "operationName": "UserTransactions",
        "query": query,
        "variables": { txArray }
    }

    //Get the other side of each transaction. Get the owners that are not USER

    const response = await axios({
        url: "https://api.studio.thegraph.com/query/32070/erc20-balances/version/latest",
        method: 'post',
        headers: {
            "Content-Type": "application/json",
        },
        data: balanceChangesReq
    });

    return response.data.data.balanceChanges
}

const processUserTransactions = async (txArray) => {
    const associatedAddresses = {}
    const tokensTransacted = {}
    const uniqueTxList = {}
    txArray.forEach(x => {
        uniqueTxList[x.transaction] = true
        if (x.owner !== USER.split("0x").join("")) {
            if (!Object.keys(associatedAddresses).includes(x.owner)) {
                associatedAddresses[x.owner] = {
                    timesSentToUser: 0,
                    timesReceivedFromUser: 0,
                    valueSentToUser: 0,
                    valueReceivedFromUser: 0,
                    tokensTransacted: []
                }
            }

            if (Number(x.oldBalance) > Number(x.newBalance)) {
                associatedAddresses[x.owner].timesReceivedFromUser += 1
                associatedAddresses[x.owner].valueReceivedFromUser += Number(x.transferValue)
            } else {
                associatedAddresses[x.owner].timesSentToUser += 1
                associatedAddresses[x.owner].valueSentToUser += Number(x.transferValue)
            }
            associatedAddresses[x.owner].tokensTransacted.push(x.contract)

            if (!Object.keys(tokensTransacted).includes(x.contract)) {
                tokensTransacted[x.contract] = {
                    timesSentToUser: 0,
                    timesUserSent: 0,
                    valueSentToUser: 0,
                    valueUserSent: 0,
                    associatedAddresses: []
                }
            }

            if (Number(x.oldBalance) > Number(x.newBalance)) {
                tokensTransacted[x.contract].timesUserSent += 1
                tokensTransacted[x.contract].valueUserSent += Number(x.transferValue)
            } else {
                tokensTransacted[x.contract].timesSentToUser += 1
                tokensTransacted[x.contract].valueSentToUser += Number(x.transferValue)
            }
            tokensTransacted[x.contract].associatedAddresses.push(x.owner)

        }
    })

    return { associatedAddresses, tokensTransacted, uniqueTxList: Object.keys(uniqueTxList) }
}


const getUserScore = async (protocolData, tx) => {
    let userScore = 0
    if (!SCORE_CALCULATION_URI) {
        // If no calculation script provided, uses default logic 
        const userChains = []
        const userProtocols = []
        const identicalPositions = {}

        protocolData.forEach(protocolUserInstance => {
            if (protocolUserInstance.positions?.length >= 1 || protocolUserInstance.account) {
                const chain = protocolUserInstance.protocols?.[0]?.network
                if (chain && !userChains.includes(chain)) {
                    userChains.push(chain)
                }
                const slug = protocolUserInstance.protocols?.[0]?.slug
                if (slug && !userProtocols.includes(slug)) {
                    userProtocols.push(slug)
                }
            }
            if (protocolUserInstance.positions) {
                protocolUserInstance.positions.forEach(position => {
                    if (identicalPositions[position.principal]) {
                        // +2 points for each position opened up with an identical principal amount
                        returnObject.messages.push("+2 points for each position opened up with an identical principal amount: " + position.principal)
                        userScore += 2
                    } else {
                        identicalPositions[position.principal] = true
                    }
                    if (Number(position.blockNumberClosed) - Number(position.blockNumberOpened) < 10000) {
                        // +1 point for each time a user makes a position and undoes a position within 10000 blocks
                        returnObject.messages.push("+1 point for each time a user makes a position and undoes a position within 10000 blocks: " + (Number(position.blockNumberClosed) - Number(position.blockNumberOpened)))
                        userScore += 1;
                    }
                    if (Number(position.blockNumberClosed) - Number(position.blockNumberOpened) < 10000 && position.withdrawCount === 1) {
                        // +4 points each time a user makes a position and undoes a position within 10000 blocks and 1 single withdraw event
                        returnObject.messages.push("+4 points each time a user makes a position and undoes a position within 10000 blocks and 1 single withdraw event: " + (Number(position.blockNumberClosed) - Number(position.blockNumberOpened)))
                        userScore += 4;
                    }
                    if (position.liquidationCount >= 1) {
                        // -5 points if user has a liquidation
                        returnObject.messages.push("-5 points if user has liquidations: " + position.liquidationCount)
                        userScore -= 5;
                    }
                })

            }
            if (protocolUserInstance.account) {

            }
        })

        if (userChains.length > 1) {
            // -3 points if a user has transacted on multiple networks
            returnObject.messages.push("-3 points if a user has transacted on multiple networks: " + JSON.stringify(userChains))
            userScore -= 3
        }
        if (userProtocols.length > 1) {
            // -2 points if a user interacts with multiple protocols
            returnObject.messages.push("-2 points if a user interacts with multiple protocols: " + JSON.stringify(userProtocols))
            userScore -= 2
        }

        if (tx.uniqueTxList.length > 10 && tx.tokensTransacted.length === 1) {
            // +3 points if user has 10+ events but only one asset
            returnObject.messages.push("+3 points if user has 10+ events but only one asset: " + tx.tokensTransacted[0])
            userScore += 3
        }
        const assoc = tx.associatedAddresses
        const sendersToUser = Object.keys(assoc).filter(addr => assoc[addr].valueSentToUser > 0)
        if (sendersToUser.length === 1) {
            // +5 points if address has only received from one address (5 points for every 3 transfers from this address)
            returnObject.messages.push("+5 points if address has only received from one address (5 points for every 3 transfers from this address): " + sendersToUser[0])
            userScore += 5 * parseInt((assoc[sendersToUser[0]].timesSentToUser / 3).toString())
        }
        if (sendersToUser.length === 2) {
            // +3 points if address has only received from two addresses (3 points for every 3 transfers from these addresses)
            returnObject.messages.push("+3 points if address has only received from two addresses (3 points for every 3 transfers from these addresses): " + JSON.stringify(sendersToUser))
            userScore += 3 * parseInt(((assoc[sendersToUser[0]].timesSentToUser + assoc[sendersToUser[1]].timesSentToUser) / 3).toString())
        }

        let totalUserReceived = 0
        Object.keys(assoc).forEach(addr => {
            totalUserReceived += assoc[addr].valueSentToUser
        })

        const majorityPayer = Object.keys(assoc).find(addr => (assoc[addr].valueSentToUser / totalUserReceived) > .5)
        if ((assoc[majorityPayer].valueSentToUser / totalUserReceived) > .8) {
            // +3 points if single address is responsible for more than 80% of funds received
            returnObject.messages.push("+3 points if single address is responsible for more than 80% of funds received: " + majorityPayer)
            userScore += 3
        }
        if ((assoc[majorityPayer].timesSentToUser / tx.uniqueTxList.length) > .8) {
            // +3 points if single address is responsible for more than 80% of transfer count
            returnObject.messages.push("+3 points if single address is responsible for more than 80% of transfer count: " + majorityPayer)
            userScore += 3
        }

        if (Object.keys(tx.tokensTransacted)?.length > 3) {
            // -5 points if 3 or more assets in history
            returnObject.messages.push("-5 points if 3 or more assets in history: " + Object.keys(tx.tokensTransacted)?.length)
            userScore -= 5;
        }
    } else {
        // Put vm logic here
        const script = fetchAndPrintJavaScript(CUSTOM_CONDITION_URI)
        const context = { tx, protocolData, USER, userScore, returnObject }; // Create a context to store the result

        runInNewContext(script, context);
    }

    return userScore
}

const queryPromises = subgraphsToQuery.map(sub => {
    return getMarketData("https://api.thegraph.com/subgraphs/name/messari/" + sub.slug, sub.type)
})
const dataResponses = await Promise.all(queryPromises)

const userHistory = await getAddressHistory()

const transactionData = await getUserTransactions(userHistory.map(x => x.transaction))

const processedTransactions = await processUserTransactions(transactionData)

const userScore = await getUserScore(dataResponses, processedTransactions)

returnObject.userScore = userScore
let determination = true
let determinationMessage = "User scored 8 or under. This is likely a human"
if (userScore > 8) {
    determination = false;
    determinationMessage = "User scored above 8. Positive bot determination."
}

returnObject.isHuman = determination
returnObject.messages.push(determinationMessage)

// add customizable outputs here

await resolveAlerts(argsObj, returnObject)

//This log can be used as output JSON
console.log(JSON.stringify(returnObject))