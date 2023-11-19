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
import { fetchAndPrintJavaScript, getCurrentBlock, resolveAlerts } from "./helpers.js";
import { runInNewContext } from "vm";

// This service can alert for all ERC20/ETH transfers of a certain user or all transfers of a token above threshhold in VALUE


const args = process.argv.slice(2)
const TYPE = args[0] || "ETH" // Either "ERC" or "ETH". 
const CONDITION = args[1] || "TOKEN" // Either "USER" or "TOKEN". This is to distinguish if this monitor should check all transfers made by an address, or all transfers of a given token  
const ADDRESS = args[2] || "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" //The user or token address to monitor. If monitoring all ETH transfers, leave this ""
const VALUE = args[3] || 1000000000000000000 // The treshhold of amount to be transfered to trigger alert behavior
const OUTPUT = args[4] || "EXT" // Options are "INT", "EXT", "TRANSACTION", "SOCKET", "CUSTOM"
const OUTPUT_URI = (args[5] === "0" || !args[5]) ? "" : args[5] // Internal/External/Socket URI that the output fetches/connects to
const OUTPUT_OPTIONS = (args[6] === "0" || !args[6]) ? "{}" : args[6] //Stringified request options object
const CUSTOM_CONDITION_URI = (args[7] === "0" || !args[7]) ? "" : args[7] //Optional URI of a javascript file containing logic to process each transaction indexed. Accesses 'event' in context, must set 'triggered' ar to true for alert triggered 
const MSG_SCRIPT_URI = args[8] || "" // A URI of a JS file with a script that can process a custom alert message object. Accesses 'msgObj' in context, must set 'message' var as an Object

const argsObj = { TYPE, CONDITION, ADDRESS, VALUE, OUTPUT, OUTPUT_URI, OUTPUT_OPTIONS, CUSTOM_CONDITION_URI, MSG_SCRIPT_URI }

let spkgURI = ""
let moduleName = ""
// Takes in whether monitoring ETH/ERC, and javascript behavior file URI as args
if (TYPE === "ERC") {
    spkgURI = "https://github.com/streamingfast/substreams-erc20-balance-changes/releases/download/v1.1.0/erc20-balance-changes-v1.1.0.spkg"
    moduleName = "map_balance_changes"
}
if (TYPE === "ETH") {
    spkgURI = "https://spkg.io/streamingfast/eth-balance-changes-v1.0.0.spkg"
    moduleName = "map_balance_changes"
}

const substream = await fetchSubstream(spkgURI);
const registry = createRegistry(substream);
const transport = createGrpcTransport({
    baseUrl: "https://mainnet.eth.streamingfast.io",
    httpVersion: "2",
    interceptors: [createAuthInterceptor(process.env.sf_token)],
    jsonOptions: {
        typeRegistry: registry,
    },
});
const initialBlock = await getCurrentBlock()

const poll = async (startBlock) => {
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
            output.balanceChanges.forEach(balanceChange => {
                const event = { ...balanceChange, block: response.message.value.clock.number.toString() }
                delete event.ordinal
                let amount = Number(event.transferValue) || 0
                if (TYPE === "ETH") {
                    amount = Math.abs(Number(event.oldValue) - Number(event.newValue))
                }

                if (CONDITION === "TOKEN") {
                    if (ADDRESS?.toUpperCase()?.includes((event?.contract?.toUpperCase())) || TYPE === "ETH") {
                        if (amount > VALUE) {
                            // console.log('alert triggered!', event)
                            if (!alertArray.find(x => x.transaction === event.transaction)) {
                                console.log(event)
                                alertArray.push(resolveAlerts(argsObj, event))
                            }
                        }
                    }
                }
                if (CONDITION === "USER") {
                    if (ADDRESS.toUpperCase().includes((event.owner.toUpperCase()))) {
                        if (amount > VALUE) {
                            console.log('alert triggered!', event)
                            if (!alertArray.find(x => x.transaction === event.transaction)) {
                                console.log(event)
                                alertArray.push(resolveAlerts(argsObj, event))
                            }
                        }
                    }
                }

                if (CUSTOM_CONDITION_URI) {
                    const script = fetchAndPrintJavaScript(CUSTOM_CONDITION_URI)
                    const context = { event, triggered: false }; // Create a context to store the result

                    runInNewContext(script, context);
                    if (context.triggered) {
                        if (!alertArray.find(x => x.transaction === event.transaction)) {
                            console.log(event)
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

