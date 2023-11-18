import { createGrpcTransport } from "@connectrpc/connect-node";
import {
    createAuthInterceptor,
    createRegistry,
    createRequest,
    fetchSubstream,
    isEmptyMessage,
    streamBlocks,
    unpackMapOutput,
} from "@substreams/core";
import { eventMapping, fetchAndPrintJavaScript, getCurrentBlock, resolveAlerts } from "./helpers.js";
import { runInNewContext } from "vm";


const args = process.argv.slice(2)
const SLUG = args[0] || "AAVE"
let spkgURI = ""
let moduleName = ""
// Takes in protocol slug, pool id and javascript behavior file URI as args
if (SLUG === "UNI") {
    spkgURI = "https://spkg.io/streamingfast/uniswap-v3-v0.2.7.spkg"
    // IMPORTANT!
    moduleName = "???"
}
if (SLUG === "AAVE") {
    spkgURI = "https://spkg.io/streamingfast/aave-v2-lending-pool-v0.1.2.spkg"
    moduleName = "map_events"
}
if (SLUG === "COMP") {
    spkgURI = "https://spkg.io/streamingfast/compound-v2-v0.1.2.spkg"
    moduleName = "map_events"
}



// This service can alert for all ERC20/ETH transfers of a certain user or all transfers of a token above threshhold in VALUE

const EVENT = args[1] || "DEPOSIT" // DEPOSIT, WITHDRAW, BORROW, REPAY, SWAP 
const POOL = args[2] || "" //The user or token address to monitor. If monitoring all ETH transfers, leave this ""
const VALUE = args[3] || 100000000000000000000 // The treshhold of amount to be transfered to trigger alert behavior
const OUTPUT = args[4] || "EXT" // Options are "INT", "EXT", "TRANSACTION", "SOCKET", "CUSTOM"
const OUTPUT_URI = args[5] || "" // Internal/External/Socket URI
const OUTPUT_OPTIONS = args[6] || "{}" //Stringified request options object
const CUSTOM_CONDITION_URI = args[7] || "" //Optional URI of a javascript file containing logic to process each transaction indexed. Accesses 'event' in context, must set 'triggered' ar to true for alert triggered 
const MSG_SCRIPT_URI = args[8] || "TEST" // A URI of a JS file with a script that can process a custom alert message object. Accesses 'msgObj' in context, must set 'message' var as an Object
const argsObj = { SLUG, POOL, EVENT, VALUE, OUTPUT, OUTPUT_URI, OUTPUT_OPTIONS, CUSTOM_CONDITION_URI, MSG_SCRIPT_URI }



const key = eventMapping[EVENT][SLUG]

const substream = await fetchSubstream(spkgURI);
const registry = createRegistry(substream);
const transport = createGrpcTransport({
    baseUrl: "https://mainnet.eth.streamingfast.io",
    httpVersion: "2",
    interceptors: [createAuthInterceptor(process.env.sf_token || 'eyJhbGciOiJLTVNFUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjIwMTUzNTE0OTMsImp0aSI6IjQxMDlkMjE0LWMyYTYtNGNmNi05YWYzLTNlYWNlMTFkZmI2YyIsImlhdCI6MTY5OTk5MTQ5MywiaXNzIjoiZGZ1c2UuaW8iLCJzdWIiOiIwY3lraTNlNGNlYWU2N2MzMDI3YjQiLCJ2IjoxLCJha2kiOiI1MGQyYjhhMTQxNmExMDhjMmM4NmVhZmZiZDU5OGE4NWI2YWI1MjE4NWFlYWY3MTY3MjNlM2UwMDMyYmUwYWVkIiwidWlkIjoiMGN5a2kzZTRjZWFlNjdjMzAyN2I0In0.sgJPeVaKWJxiXrObA67dC7X9u-G0Uy0xqegKjbTLWEhkAGBc-yh2jHf6Ic-S10vxqdQT_BMmpdFMvohviyjRyA')],
    jsonOptions: {
        typeRegistry: registry,
    },
});

const initialBlock = await getCurrentBlock()

const poll = async (startBlock) => {
    console.log("Recur check", startBlock)
    const request = createRequest({
        substreamPackage: substream,
        outputModule: moduleName,
        productionMode: true,
        startBlockNum: startBlock,
        stopBlockNum: "+10000",
    });

    let block = 0
    for await (const response of streamBlocks(transport, request)) {
        const output = unpackMapOutput(response, registry);
        if (output !== undefined && !isEmptyMessage(output)) {
            block = response.message.value.finalBlockHeight.toString()
            const alertArray = [];
            output[key].forEach(eventObj => {
                const event = { ...eventObj, block: response.message.value.clock.number.toString() }
                console.log(event.user.toString())
                let amount = Number(event.amount) || 0

                if (POOL.toUpperCase().includes((event.owner.toUpperCase()))) {
                    if (amount > VALUE) {
                        console.log('alert triggered!', event)
                        if (!alertArray.find(x => x.transaction === event.transaction)) {
                            alertArray.push(resolveAlerts(argsObj, event))
                        }
                    }
                }

                if (CUSTOM_CONDITION_URI) {
                    const script = fetchAndPrintJavaScript(CUSTOM_CONDITION_URI)
                    const context = { event, triggered: false }; // Create a context to store the result

                    runInNewContext(script, context);
                    if (context.triggered) {
                        if (!alertArray.find(x => x.transaction === event.transaction)) {
                            alertArray.push(resolveAlerts(argsObj, event))
                        }
                    }
                }
            })
            await Promise.all(alertArray)
        }
    }
    return poll(block)
}

await poll(initialBlock)


