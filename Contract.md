# SocialBet contract

## Bet representation and creation

### Bets data

Bets are stored in the ``bets`` mapping (``uint256 betId => Bet structure``
Bet can be retrieved using ``bets(uint256 betId) → Bet bet`` ``betId`` can be calculated using ``calculateBetId`` function:

```Solidity
calculateBetId(
    string _metadata,
    address _firstParty,
    uint256 _firstBetValue,
    uint256 _secondBetValue,
    uint256 _secondPartyTimeframe,
    uint256 _resultTimeframe
) → uint256 betId
```

Bet struct:

```Solidity
struct Bet {
    string metadata;
    address payable firstParty;
    address payable secondParty;
    address payable mediator;
    uint256 firstBetValue;
    uint256 secondBetValue;
    uint256 mediatorFee;
    uint256 secondPartyTimeframe;
    uint256 resultTimeframe;
    BetStates state;
    Answers firstPartyAnswer;
    Answers secondPartyAnswer;
}
```

- ``metadata`` - title, description, outcome 1, outcome 2, etc.
- ``firstParty`` - first player address. First party is the creator of the bet.
- ``secondParty`` - second player address. Second party can be zero address (public bet that hasn't second player) or second player address (private bet or public bet with participating second player).
- ``mediator`` - mediator address. Mediator can be default mediator address or some random mediator address that first party chose.
- ``firstBetValue`` - first player Eth value that first party needs to pay when it creates the bet.
- ``secondBetValue`` - second player Eth value that second party needs to pay when it participating in the bet.
- ``mediatorFee`` - mediator fee percentage. Has 2 decimals digits, e.g. - 3,25% == 325. Fee is payed from the betValues.
- ``secondPartyTimeftame`` - unix timestamp before which the second player must participate in the bet.
- ``resultTimeframe`` - unix timestamp before which the result of the bet must be known. Also resultTimeframe + 7 days is the timeframe for the mediator to mediate the bet.
- ``state`` - look BetStates.
- ``firstPartyAnswer, secondPartyAnswer`` - look Answers

### Bet State

There is enum in the contract:

```Solidity
enum BetStates {
    WaitingParty2,
    WaitingFirstVote,
    WaitingSecondVote,
    WaitingMediator
}
```

It can be represented in the JS like the following object:

```JS
const BetStates = {
    WaitingParty2: new BN(`0`),
    WaitingFirstVote: new BN(`1`),
    WaitingSecondVote: new BN(`2`),
    WaitingMediator: new BN(`3`)
};
```

States:

- ``WaitingParty2`` - bet was just created and waiting second player.
- ``WaitingFirstVote`` - second party joined the bet and bet waiting for the first vote.
- ``WaitingSecondVote`` - waiting second vote. (just second vote, not second party's vote).
- ``WaitingMediator`` - if players answers weren't equal then bet is waiting for mediator to mediate the conflict.

### Answers

In the contract:

```Solidity
enum Answers {
    Unset,
    FirstPartyWins,
    SecondPartyWins,
    Tie
}
```

JS object:

```JS
const Answers = {
    Unset: new BN(`0`),
    FirstPartyWins: new BN(`1`),
    SecondPartyWins: new BN(`2`),
    Tie: new BN(`3`)
};
```

### Bet creation

To create bet call ``createBet``:

```Solidity
createBet(
    string _metadata,
    address payable _secondParty,
    address payable _mediator,
    uint256 _mediatorFee,
    uint256 _firstBetValue,
    uint256 _secondBetValue,
    uint256 _secondPartyTimeframe,
    uint256 _resultTimeframe
) → uint256 betId
```

Timeframes must be >now and bets values must be >min bet.
After the bet is created the event ``NewBetCreated`` is emitted:

```Solidity
event NewBetCreated(
    uint256 indexed _betId,
    address indexed _firstParty,
    address indexed _secondParty,
    string _metadata,
    address _mediator,
    uint256 _mediatorFee,
    uint256 _firstBetValue,
    uint256 _secondBetValue,
    uint256 _secondPartyTimeframe,
    uint256 _resultTimeframe
);
```

Function is payable and requires first bet value + bet creation fee. Bet creation fee can be calculated using the following function:

```Solidity
calculateFee(
    uint256 _firstBetValue,
    uint256 _secondBetValue
) → uint256 fee
```

## Admin functionality

### `setMinBetValue(uint256 _minBetValue)` (external)

<mark>Admin: </mark>Set new min bet value

### `setFeePercentage(uint256 _feePercentage)` (external)

<mark>Admin: </mark>Set new fee percentage

### `setDefaultMediatorFee(uint256 _defaultMediatorFee)` (external)

<mark>Admin: </mark>Set new default mediator fee

### `setDefaultMediator(address payable _defaultMediator)` (external)

<mark>Admin: </mark>Set new default mediator

### `pause()` (external)

<mark>Admin: </mark>Pause the contract. This will disable new bet creation functionality

### `unpause()` (external)

<mark>Admin: </mark>Unpause the contract. This will enable new bet creation functionality

### `withdrawFee()` (external)

<mark>Admin: </mark>Withdraws collected fee
