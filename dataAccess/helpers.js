import { runInNewContext } from "vm";

export const getCurrentBlock = async () => {
    try {
        const res = await fetch(subgraphEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                query: `{
                    _meta {
                      block {
                        number
                      }
                    }
                  }`
            })
        });
        const data = await res.json();

        return 18601435 || data.data["_meta"]?.block?.number;

    } catch (err) {
        console.log("Error caught - ", err.message);
    }
    return 18601435;
}

export const resolveAlerts = async (args, objectToAlert) => {
    //This is the logic for actually making the alert request

    //User passes function for creating the alert message/data to pass out of the object
    // If URI to a JS file with messageProcess(msgObj) pull and exec logic in the function in the args.MSG_SCRIPT_URI arg
    let msgObj = objectToAlert
    if (args.MSG_SCRIPT_URI) {
        const script = await fetchAndPrintJavaScript(args.MSG_SCRIPT_URI)
        const context = { msgObj, message: msgObj }; // Create a context to store the result

        runInNewContext(script, context);
        msgObj = context.message
    }
    //User selects an output type and provides function to configure this behavior

    if (args.OUTPUT === "INT") {
        // INTERNAL OUTPUT TYPE ONLY FOR REQUESTS WHERE BODY IS UNCHANGED MSGOBJ JSON
        // FOR CUSTOM BODY PARAMETER, OUTPUT TYPE MUST BE CUSTOM
        const serverAddress = 'host.docker.internal'; // or use the host machine's IP address
        // `http://${serverAddress}:${port}/`
        const internalEndpoint = args.OUTPUT_URI; // Replace with your internal API endpoint

        const requestOptions = {
            ...JSON.parse(args.OUTPUT_OPTIONS),
            body: JSON.stringify(msgObj),
        };
        try {
            const response = await fetch(internalEndpoint, requestOptions);
            if (!response.ok) {
                throw new Error(`Internal HTTP request failed. Status: ${response.status}`);
            }

            // console.log("Internal HTTP Request: Alert data sent successfully");
        } catch (error) {
            console.error('Internal HTTP Request Error:', error.message);
        }
    }

    // Placeholder logic for external fetch to a public endpoint
    if (args.OUTPUT === "EXT") {
        // EXTERNAL OUTPUT TYPE ONLY FOR REQUESTS WHERE BODY IS UNCHANGED MSGOBJ JSON
        // FOR CUSTOM BODY PARAMETER, OUTPUT TYPE MUST BE CUSTOM

        const externalEndpoint = args.OUTPUT_URI; // Replace with your external API endpoint
        const requestOptions = {
            ...JSON.parse(args.OUTPUT_OPTIONS),
            body: JSON.stringify(msgObj),
        };

        // try {
        //     const response = await fetch(externalEndpoint, requestOptions);
        //     if (!response.ok) {
        //         throw new Error(`External Fetch failed. Status: ${response.status}`);
        //     }

        //     console.log("External Fetch: Alert data sent successfully");
        // } catch (error) {
        //     console.error('External Fetch Error:', error.message);
        // }
    }
    if (args.OUTPUT === "SOCKET") {
        // set up template for socket emit from here
    }
    if (args.OUTPUT === "TRANSACTION") {
        // For auto executing a transaction upon an alert trigger, user must make a transactions file with Ethers for executing tx from their address
        // For this, the user must build the docker container on their local machine, including the transactions file in the Docker build
    }
    if (args.OUTPUT === "CUSTOM") {
        // Get custom javascript behavior for output and execute
        // Passes the current msgObj within the script
        const script = await fetchAndPrintJavaScript(args.OUTPUT_SCRIPT_URI)
        const context = { msgObj }; // Create a context to store the result

        runInNewContext(script, context);
    }
}

export const fetchAndPrintJavaScript = async (uri) => {
    // try {
    //     const response = await fetch(uri);

    //     if (!response.ok) {
    //         throw new Error(`Failed to fetch JavaScript file. Status: ${response.status}`);
    //     }

    //     const scriptContent = await response.text();
    //     return scriptContent
    // } catch (error) {
    //     console.error('Error:', error.message);
    // }
    return `
    message = {...msgObj, tx: msgObj.transaction}`
}

export const eventMapping = {
    DEPOSIT: {
        AAVE: "deposits",
        COMP: "marketEntereds",
        UNI: ""
    },
    WITHDRAW: {
        AAVE: "withdraws",
        COMP: "marketExiteds",
        UNI: ""
    },
    BORROW: {
        AAVE: "borrows",
        COMP: "distributedBorrowerComps",
        UNI: ""
    },
    REPAY: {
        AAVE: "repays",
        COMP: "",
        UNI: ""
    },
    SWAP: {
        AAVE: "",
        COMP: "",
        UNI: ""
    },
    LIQUIDATES: {
        AAVE: "",
        COMP: "",
        UNI: ""
    }
}