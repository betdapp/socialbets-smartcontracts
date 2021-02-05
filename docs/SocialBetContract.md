# SocialBet contract

## Bet representation and creation

### Bets data

Bets are stored in the `bets` mapping (`uint256 betId => Bet structure`
Bet can be retrieved using `bets(uint256 betId) → Bet bet` `betId` can be calculated using `calculateBetId` function:

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

- `metadata` - title, description, outcome 1, outcome 2, etc.
- `firstParty` - first player address. First party is the creator of the bet.
- `secondParty` - second player address. Second party can be zero address (public bet that hasn't second player) or second player address (private bet or public bet with participating second player).
- `mediator` - mediator address. Mediator can be default mediator address or some random mediator address that first party chose.
- `firstBetValue` - first player Eth value that first party needs to pay when it creates the bet.
- `secondBetValue` - second player Eth value that second party needs to pay when it participating in the bet.
- `mediatorFee` - mediator fee percentage. Has 2 decimals digits, e.g. - 3,25% == 325. Fee is payed from the betValues.
- `secondPartyTimeftame` - unix timestamp before which the second player must participate in the bet.
- `resultTimeframe` - unix timestamp before which the result of the bet must be known. Also resultTimeframe + 7 days is the timeframe for the mediator to mediate the bet.
- `state` - look BetStates.
- `firstPartyAnswer, secondPartyAnswer` - look Answers

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

- `WaitingParty2` - bet was just created and waiting second player.
- `WaitingFirstVote` - second party joined the bet and bet waiting for the first vote.
- `WaitingSecondVote` - waiting second vote. (just second vote, not second party's vote).
- `WaitingMediator` - if players answers weren't equal then bet is waiting for mediator to mediate the conflict.

### Bet completion reasons

There are two completion events - Finish (when there is the winner) and Cancel (when money returns to the both parties). Both events have reasons why they was emitted:

```Solidity
enum BetCancellationReasons {
    Party2Timeout,
    VotesTimeout,
    Tie,
    MediatorTimeout,
    MediatorCancelled
}
```
```Solidity
enum BetFinishReasons {
    AnswersMatched,
    MediatorFinished
}
```

This enums can be represented:

```JS
const BetCancellationReasons = {
    Party2Timeout: new BN(`0`),
    VotesTimeout: new BN(`1`),
    Tie: new BN(`2`),
    MediatorTimeout: new BN(`3`),
    MediatorCancelled: new BN(`4`)
};
const BetFinishReasons = {
    AnswersMatched: new BN(`0`),
    MediatorFinished: new BN(`1`)
};
```

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

To create bet call `createBet`:

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
After the bet is created the event `NewBetCreated` is emitted:

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

## Getters and calculation

## Variables and constants

These variables can be readed if called like a functions in the Web3. E.g. bet can be readed if call `contractInstance.methods.bets(betId).call()` or collected fee value like `contractInstance.methods.collectedFee().call()`. feePercentage and mediator's default fee are both percentages (given decimals, e.g. 3.25% = 325, 10% = 1000).

```Solidity
// Storage

//betId => bet
mapping(uint256 => Bet) public bets;

// fee value collected for the owner to withdraw
uint256 public collectedFee;

// Storage: Admin Settings
uint256 public minBetValue;
// bet creation fee
uint256 public feePercentage;
// mediator settings
address payable public defaultMediator;
uint256 public defaultMediatorFee;
uint256 public mediationTimeLimit = 7 days;

// Constants
uint256 public constant FEE_DECIMALS = 2;
uint256 public constant FEE_PERCENTAGE_DIVISION = 10000;
uint256 public constant MEDIATOR_FEE_DIVISION = 10000;
```

### Active bets getters

These functions returns active bets (that wasn't completed) for the users.

- First party active bets are the bets that was created by the user.
- Second party active bets are the bets where user is participating as the second player.
- Mediator active bets are the bets where bet is waiting for user to mediate.

```Solidity
function getFirstPartyActiveBets(address _firstParty) external view returns (uint256[] memory betsIds)

function getSecondPartyActiveBets(address _secondParty) external view returns (uint256[] memory betsIds)

function getMediatorActiveBets(address _mediator) external view returns (uint256[] memory betsIds)
```

### Bet ID calculation

Bet id can be calculated from the bet properties with this function:

```Solidity
function calculateBetId(
    string memory _metadata,
    address _firstParty,
    uint256 _firstBetValue,
    uint256 _secondBetValue,
    uint256 _secondPartyTimeframe,
    uint256 _resultTimeframe
) public pure returns (uint256 betId)
```

### Check if bet exists

This function can be used to check if bet with the passed bet id exists:

```Solidity
 function isBetExists(uint256 _betId) public view returns (bool isExists)
```

### Fees calculation

This function can be used to get fee value for the bet creation:

```Solidity
function calculateFee(uint256 _firstBetValue, uint256 _secondBetValue) public view returns (uint256 fee)
```

And this function returns fee value that mediator will get if he will mediate the bet:

```Solidity
function calculateMediatorFee(uint256 _betId) public view returns (uint256 mediatorFeeValue)
```

## Second player participating

This function must be called by the second player. Call must be payed with the second bet value. Can't be called by the first party or mediator of the bet. Can't be called if the second party already joined the bet. Call cancels bet if  second party is late for participating.

```Solidity
function participate(uint256 _betId) external payable returns (bool success)
```

## Vote

This function must be called by the second or first party. _answer value can't be Unset (that is zero, look Answers struct). Bet must be waiting for the answer (state == WaitingFirstVote || state == WaitingSecondVote). Player can't change the answer (i.e. call the function twice). If answer waiting time has expired and nobody set the answer then bet cancels on the function call. If one party didn't set the answer before timeframe the bet waits for mediator.

```Solidity
function vote(uint256 _betId, Answers _answer) external
```

## Mediate

This function must be called by the mediator of the bet. _answer value can't be Unset (that is zero, look Answers struct). Bet must be waiting for the mediator (state == WaitingMediator). If mediating time has expired then bet will be cancelled on the function call.

```Solidity
function mediate(uint256 _betId, Answers _answer) external
```

## Timeout handlers

Timeout handlers are the functions to be called if someone is late for some action. They (functions) can be called by anyone. Can't be called if there is still time left to do the action (when there is no timeout).

### Second party participating timeout handler

Checks secondPartyTimeframe. Cancels bet if second party is late for participating.

```Solidity
function party2TimeoutHandler(uint256 _betId) external
```

### Voting timeout handler

Checks bet's resultTimeframe. If answer waiting time has expired and nobody set the answer then bet cancels. If one party didn't set the answer before timeframe the bet waits for mediator.

```Solidity
function votesTimeoutHandler(uint256 _betId) external
```

### Mediation timeout handler

Checks mediator timeframe (resultTimeframe + MEDIATION_TIME_LIMIT) and cancels bet if time has expired

```Solidity
function mediatorTimeoutHandler(uint256 _betId) external
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

### `setMediationTimeLimit(uint256 _mediationTimeLimit)` (external)

<mark>Admin: </mark>Set new mediation time limit

### `pause()` (external)

<mark>Admin: </mark>Pause the contract. This will disable new bet creation functionality

### `unpause()` (external)

<mark>Admin: </mark>Unpause the contract. This will enable new bet creation functionality

### `withdrawFee()` (external)

<mark>Admin: </mark>Withdraws collected fee
