# DATADOCK

DataDock is an application for creating customizable monitors, analysis tools, and bots. By exposing various modular blockchain analysis tools that are both ready out of the box and deeply specializable, you can use granular blockchain data to automate any task that you need!

Datadock is meant to be run inside of a Docker container. This allows for easy integrations like:

- Embedding into an existing API for enterprise uses
- Building a lightweight server for your web app
- Creating uniform dispute logic to bring historical data on chain with an optimistic oracle
- Automated alerts for your Discord server
- Running your own private automated arbitrage bot on your laptop

## Data Sources

DataDock uses Streamingfast Substreams and Messari Standardized Subgraphs. 

For the userAnalysis service, I deployed the "ERC20-Balance-Changes" Substream built by Streamingfast as a subgraph, making every single ERC20 transfer a queryable entity for analysis. 

Subgraph URI: https://api.studio.thegraph.com/query/32070/erc20-balances/version/latest
Deployment ID: QmRbu5rwd8ssHcfiB8xgEKUy5myjLRmkJ6ixrrcEGc8ypD

## Tool Types

There are 2 main categories of tools; Streams and Reads

### Streams

Streams are powered by Streamingfast Substreams in order to get live transaction data as soon as it is mined. Access block data faster than the Etherscan API. This category is ideal for building monitor services and bots, as the built in tools provided by DataDock allow you to parse every single transaction on every block as it is mined. With customized triggersand logic, you can scan for events and act accordingly with behavior such as internal server calls, external API requests, socket emissions, and Ethereum transaction signing. 

#### TransferMonitor

This service parses every block on Ethereum Mainnet for either ETH or ERC20 transfers as it is mined. This allows users to set up alerts that execute their custom conditions to detect matching transfers on every block. This service is powered by the Streamingfast ERC20 Balance Changes Substream and the ETH Balance Changes Substream. This allows you to build bots and monitors that iterate as soon as a block gets mined. This service has default conditions that execute an alert for every ETH transfer over 1 ETH. There are many output options such as API calls that post to your database or socket emissions that display every new transaction to your dApp frontend. There are custom script inputs for addng your own data into the condition setting or alerts triggers. This service can be incredibly simple and work with a single run cmd, or can create you a powerful monitor that automates important, time sensitive tasks.

As an example, you can scan each block as its mined for any transfer of WBTC over 10 tokens. Then with your selections, you can post a message to a Discord server. Or you can even securely integrate an Ethers instantiation of your "signer" to automatically send a transaction.

Command to try out this monitor as a Docker image: `docker run -e sf_token='YOUR_STREAMINGFAST_TOKEN'  cm172596/datadock ./transferMonitor.js $TYPE $TOKEN $ADDRESS $VALUE $OUTPUT $OUTPUT_URI $OUTPUT_OPTIONS $CUSTOM_CONDITION_URI $MSG_SCRIPT_URI`;

Keep in mind it will initially speed over the blocks between the start block provided and the chain head. Then it will execute as it receives blocks.

All arguments with $ have defaults. Currently they must be input in that order. For null/falsey use 0. 

- TYPE "ETH" // Either "ERC" or "ETH". 
- CONDITION "TOKEN" // Either "USER" or "TOKEN". This is to distinguish if this monitor should check all transfers made by an address, or all transfers of a given token  
- ADDRESS "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" //The user or token address to monitor. If monitoring all ETH transfers, leave this ""
- VALUE 1000000000000000000 // The treshhold of amount to be transfered to trigger alert behavior
- OUTPUT "EXT" // Options are "INT", "EXT", "TRANSACTION", "SOCKET", "CUSTOM"
- OUTPUT_URI "" // Internal/External/Socket URI that the output fetches/connects to
- OUTPUT_OPTIONS "{}" //Stringified request options object
- CUSTOM_CONDITION_URI "" //Optional URI of a javascript file containing logic to process each transaction indexed. Accesses 'event' in context, must set 'triggered' var to true for alert triggered 
- MSG_SCRIPT_URI "TEST" // A URI of a JS file with a script that can process a custom alert message object. Accesses 'msgObj' in context, must set 'message' var as an Object

#### PoolMonitor

This monitor gets a live feed of DeFi events as they are mined. The supported protocols are AAVE, Uniswap, and Compound. Each protocol is scanned for the following events

- DEPOSIT
- WITHDRAW
- BORROW
- REPAY
- SWAP
- LIQUIDATES

If any of these events trigger the user set conditions, the user defined alert behavior is triggered. 

This monitor uses the following substreams:

- https://spkg.io/streamingfast/uniswap-v3-v0.2.7.spkg
- https://spkg.io/streamingfast/aave-v2-lending-pool-v0.1.2.spkg
- https://spkg.io/streamingfast/compound-v2-v0.1.2.spkg

### Reads

Reads use subgraph data in order to analyze indexed, historical blockchain data. With the Messari standardized subgraphs, you can easily compare metrics like yields, volatility, individual positions, counts, cumulative values, etc between different DeFi protocols. This data is incredibly granular, showing every possible statistic on every single transaction/user in the protocol. See subgraphs.xyz for a list of all available DeFi Subgraphs compatible with DataDock. 

For even more specificity, you can use the "ERC20-balances" subgraph deployed by DataDock that provides data points for every single ERC20 transfer that has occured on Ethereum Mainnet (deployed from Streamingfast's spkg). Combining data from every ERC20 transfer with custom scoring logic, you can analyze an address for any metric or trait you want. Since this subgraph was deployed on 18/11, it may not be synced up to chain head by the time that you are reading this.

#### userAnalysis

For the anti-sybil service, DataDock provides a customizable tool called userAnalysis. This service takes in an address and gives a score on how likely this address is a bot or a single user passing funds around. For those looking to implement this tool, the parameters and scoring system allow for customization. The defaults are more of an example of what kinds of logic we can use, what we can check for, and how specific or wide we can be when analyzing a user's history. Here are the current defaults:   

- +2 points for each DeFi position/deposit opened up with an identical principal amount
- +1 point for each time a user makes a DeFi position/deposit and undoes a position within 10000 blocks
- +4 points each time a user makes a position/deposit and undoes the position within 10000 blocks and 1 single withdraw event
- -5 points if user has a liquidation
- -3 points if a user has transacted on multiple networks
- -2 points if a user interacts with multiple protocols
- +3 points if user has 10+ events but only one asset
- +5 points if address has only received from one address (5 points for every 3 transfers from this address)
- +3 points if address has only received from two addresses (3 points for every 3 transfers from these addresses)
- +3 points if single address is responsible for more than 80% of funds received
- +3 points if single address is responsible for more than 80% of transfer count
- -5 points if 3 or more assets in history

The current determination is that if an address has a score higher than 8, it is either a bot/suspicious. Below that, likely a human.

Want to analyze an address? Execute `docker run cm172596/datadock ./services/userAnalysis.js ADDRESS_HERE` in terminal (replace 'ADDRESS_HERE' with the address you want to analyze). This executes with defaults. For the time being, while the custom scripts are accepted as inputs, for the moment asynchronous logic is not supported. 

#### poolAnalysis

## Important functionality

- resolveAlerts(): This function is in the helpers.js file. This triggers output behaviors from within the Docker like external api calls, socket connections, internal requests, and Ethereum transaction integration
