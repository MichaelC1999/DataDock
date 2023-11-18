// Docker Containers should accept subgraph/substream as input
// -User/service/contract passes in the subgraph/substream endpoint and javascript IPFS URL as input
// -Pull javascript from IPFS url
// -Hardcoded logic to hit the endpoint passed in as input
// -Upon response received from endpoint
// 	-Subgraph receives the single response, execute the javascript from IPFS file over the response JSON 
// 	-Substream each iterable response received, call a function to execute some logic as the substream continues to poll

// Takes in protocol slug, pool id, and script URI as inputs
// Queries to a single subgraph, pulling TS/current data from the pool
// Inserts this data into the user provided script

// Takes in the protocol name, then queries similar pools on all deployments of the protocol
// ***LOW PRIORITY***

const args = process.argv.slice(2)

const subgraphEndpoint = args[0] || "https://api.thegraph.com/subgraphs/name/messari/aave-v3-ethereum"
const dataAnalysisScriptURI = args[1] || "https://raw.githubusercontent.com/MichaelC1999/billboard/main/UI/.prettierrc.js"

async function fetchAndPrintJavaScript(uri) {
    try {
        const response = await fetch(uri);

        if (!response.ok) {
            throw new Error(`Failed to fetch JavaScript file. Status: ${response.status}`);
        }

        const scriptContent = await response.text();
        console.log('JavaScript content:');
        console.log(scriptContent);
        return scriptContent
    } catch (error) {
        console.error('Error:', error.message);
    }
}

const strategyCalculation = async (args) => {
    const curPoolId = "0x0";
    try {

        const curPositionDataResponse = await fetch(subgraphEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                query: `{
                            markets {
                                id
                                totalValueLockedUSD
                            }
                        }`
            })
        });
        const curPositionData = await curPositionDataResponse.json();

        return curPositionData;

    } catch (err) {
        console.log("Error caught - ", err.message);
    }

    return (curPoolId);

}

// const afterScript = await fetchAndPrintJavaScript(dataAnalysisScriptURI)
const afterScript = `
const data = null;
const returnArr = data.markets.map(x => {
    return x.id + " has TVL of " + x.totalValueLockedUSD
})
console.log("TEST INNER EXEC LOG: " + returnArr.join(", "))
`

const calculation = await strategyCalculation([]);
console.log(calculation, afterScript)

console.log(process.argv, "READ THE ARGS!!!")

const data = calculation.data
if (!data) {
    console.log(calculation, 'NO DATA!')
}
const scriptToExec = afterScript.split("const data = null").join("const data = " + JSON.stringify(data))
console.log(data)
eval(scriptToExec)

