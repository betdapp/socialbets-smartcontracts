const SocialBets = artifacts.require("SocialBets");
require(`dotenv`).config();
module.exports = function (deployer, network, accounts) {
  deployer.deploy(SocialBets,
    process.env.FEE,
    process.env.MIN_BET_VALUE,
    process.env.DEFAULT_MEDIATOR_FEE,
    process.env.DEFAULT_MEDIATOR_ADDRESS
  );
};