// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.6.12;

import "../SocialBets.sol";

contract CallSocialBets {
    function callCreate(
        SocialBets socBets,
        string memory _metadata,
        address payable _secondParty,
        address payable _mediator,
        uint256 _mediatorFee,
        uint256 _firstBetValue,
        uint256 _secondBetValue,
        uint256 _secondPartyTimeframe,
        uint256 _resultTimeframe
    ) external {
        socBets.createBet(
            _metadata,
            _secondParty,
            _mediator,
            _mediatorFee,
            _firstBetValue,
            _secondBetValue,
            _secondPartyTimeframe,
            _resultTimeframe
        );
    }
}
