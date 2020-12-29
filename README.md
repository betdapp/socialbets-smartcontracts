# Social Bets contract

## Prerequisites

For development purposes, you will need `Node.js` (`v12.18.3`) and `npm` (`v6.14.6`).

## 1. Installation

Run the command `$ npm install` to install all the dependencies specified in `package.json`.

## 2. Configuration

### `.env`

For the deployment process to be successfully performed, **manually created** `.env` file with filled-in parameters should be present at the root of the project (look `example.env`). You need the following to be filled:

#### Dev settings

- `PRIVATE_KEY` Private key for the deployment.
- `FEE`, `MIN_BET_VALUE`, `DEFAULT_MEDIATOR_ADDRESS`, `DEFAULT_MEDIATOR_FEE` - Social Bets contract's constructor arguments.

## 3. Running scripts

### Compilation
Use `$ npm run build` to compile the smart-contracts.

### *Dev tools*

`$ npm run ganache` to start a local Ganache node.

### Testing

Run `$ npm run ganache` to start the Ganache development network. Perform tests with `$ npm test` to run all tests from the `test/` directory.

### Deployment
Before proceeding with the deployment process, make sure you have set up the `.env` file.

Run ``$ npm run migrate -- --network <network_name>`` with ``<network_name>`` replaced with testnet/mainnet name to deploy the smart-contracts.