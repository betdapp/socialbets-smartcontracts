const { gatherSources } = require("@resolver-engine/imports");
const { ImportsFsEngine } = require("@resolver-engine/imports-fs");

async function getSolidityInput(contractPath) {
    let input = await gatherSources([contractPath], process.cwd(), ImportsFsEngine());
    input = input.map((obj) => ({...obj, url: obj.url.replace(`${process.cwd()}/`, "")}));

    const sources = {};
    for (const file of input) {
        sources[file.url] = {content: file.source};
    }

    const inputJSON = {
        language: "Solidity",
        settings: {
            outputSelection: {
                "*": {
                    "*": [
                        "abi",
                        "evm.bytecode",
                        "evm.deployedBytecode",
                    ],
                },
            },
            optimizer: {
                enabled: true,
                runs: 200
            }
        },
        sources,
    };

    return JSON.stringify(inputJSON, null, 2);
}

getSolidityInput("contracts/SocialBets.sol").then(console.log);