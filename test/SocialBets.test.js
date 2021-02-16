const {
    constants,
    expectEvent,
    expectRevert,
    balance,
    time,
    ether
} = require('@openzeppelin/test-helpers');
const duration = time.duration;
const BN = web3.utils.BN;
const chai = require('chai');
chai.use(require('chai-bn')(BN));
const should = require('chai').should();
const assert = require('assert').strict;
const SocialBets = artifacts.require("SocialBets");
const CallSocialBets = artifacts.require("CallSocialBets");

contract("Socials Bets", async accounts => {

    const [owner, firstParty, secondParty, publicSecondParty, mediator, defaultMediator, thirdParty] = accounts;
    const FEE_PERCENTAGE_DIVISION = new BN(`10000`);
    const MEDIATOR_FEE_DIVISION = new BN(`10000`);
    const MEDIATION_TIME_LIMIT = new BN(`${7*24*3600}`); //seconds
    let socialBetsInstance;
    let defaultMediatorFee = new BN(`300`);
    let fee = new BN(`300`);
    const defaultDivisor = new BN(`10000`);
    let minBetValue = new BN(`100000000000000000`); //0.1 ether; note: ether(`0.1`) doesn't work there ¯\_(ツ)_/¯
    const BetStates = {
        WaitingParty2: new BN(`0`),
        WaitingFirstVote: new BN(`1`),
        WaitingSecondVote: new BN(`2`),
        WaitingMediator: new BN(`3`)
    };
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
    const Answers = {
        Unset: new BN(`0`),
        FirstPartyWins: new BN(`1`),
        SecondPartyWins: new BN(`2`),
        Tie: new BN(`3`)
    };

    // helpers
    async function getCurrentTimestamp() {
        await time.advanceBlock();
        return await time.latest();
    }

    describe(`Constructor test`, async () => {
        it(`Constructor takes normal arguments`, async () => {
            await SocialBets.new(
                fee,
                minBetValue,
                defaultMediatorFee,
                defaultMediator
            );
        });
        it(`Constructor reverts on fee percentage higher than fee divider`, async () => {
            await expectRevert(SocialBets.new(
                defaultDivisor.addn(100),
                minBetValue,
                defaultMediatorFee,
                defaultMediator
            ), "Bad fee");
        });
        it(`Constructor reverts on mediator fee percentage higher than fee divider`, async () => {
            await expectRevert(SocialBets.new(
                fee,
                minBetValue,
                defaultDivisor.addn(100),
                defaultMediator
            ), "Bad mediator fee");
        });
        it(`Constructor reverts on mediator set to zero`, async () => {
            await expectRevert(SocialBets.new(
                fee,
                minBetValue,
                defaultMediatorFee,
                constants.ZERO_ADDRESS
            ), "Bad mediator");
        });
        it(`Constructor reverts on contract mediator`, async () => {
            await expectRevert(SocialBets.new(
                fee,
                minBetValue,
                defaultMediatorFee,
                (await CallSocialBets.new()).address
            ), "Bad mediator");
        });
    });

    describe(`Admin functionality test`, async () => {
        beforeEach(async () => {
            socialBetsInstance = await SocialBets.new(
                fee,
                minBetValue,
                defaultMediatorFee,
                defaultMediator
            );
        });

        it(`Admin can set min bet value`, async () => {
            let newMinBetValue = new BN(`17823461956371824`);
            await socialBetsInstance.setMinBetValue(newMinBetValue, {
                from: owner
            });
            (await socialBetsInstance.minBetValue()).should.bignumber.equal(newMinBetValue);
        });

        it(`Admin can set fee percentage`, async () => {
            let newFeePercentage = defaultDivisor.divn(2);
            await socialBetsInstance.setFeePercentage(newFeePercentage);
            (await socialBetsInstance.feePercentage()).should.bignumber.equal(newFeePercentage);
        });

        it(`Admin can't set fee percentage higher than fee divider`, async () => {
            let newFeePercentage = defaultDivisor.addn(100);
            await expectRevert(socialBetsInstance.setFeePercentage(newFeePercentage), "Bad fee");
        });

        it(`Admin can set default mediator fee`, async () => {
            let newDefaultMediatorFee = defaultDivisor.divn(2);
            await socialBetsInstance.setDefaultMediatorFee(newDefaultMediatorFee);
            (await socialBetsInstance.defaultMediatorFee()).should.bignumber.equal(newDefaultMediatorFee);
        });

        it(`Admin can't set default mediator fee higher that fee divider`, async () => {
            let newDefaultMediatorFee = defaultDivisor.addn(100);
            await expectRevert(socialBetsInstance.setDefaultMediatorFee(newDefaultMediatorFee), "Bad mediator fee");
        });

        it(`Admin can set default mediator`, async () => {
            let newDefaultMediator = thirdParty;
            await socialBetsInstance.setDefaultMediator(newDefaultMediator);
            (await socialBetsInstance.defaultMediator()).should.equal(newDefaultMediator);
        });

        it(`Admin can't set default mediator to zero address`, async () => {
            let newDefaultMediator = constants.ZERO_ADDRESS;
            await expectRevert(socialBetsInstance.setDefaultMediator(newDefaultMediator), "Bad mediator");
        });

        it(`Admin can't set default mediator to contract`, async () => {
            let newDefaultMediator = (await CallSocialBets.new()).address;
            await expectRevert(socialBetsInstance.setDefaultMediator(newDefaultMediator), "Bad mediator");
        });

        it(`Admin can pause and unpause bet creation`, async () => {
            await socialBetsInstance.pause();

            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            const firstTracker = await balance.tracker(firstPartyAddr);
            await expectRevert(socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            ), "Pausable: paused");

            await socialBetsInstance.unpause();

            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );
        });

        it(`Admin can withdraw fee`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const collectedBefore = await socialBetsInstance.collectedFee();

            const ownerTracker = await balance.tracker(owner);
            let res = await socialBetsInstance.withdrawFee();
            const gasUsed = new BN(res.receipt.gasUsed);

            const collectedAfter = await socialBetsInstance.collectedFee();
            collectedAfter.should.bignumber.equal(new BN(`0`));

            const delta = await ownerTracker.delta();
            delta.should.bignumber.equal(fee.sub(gasUsed));
            delta.should.bignumber.equal(collectedBefore.sub(gasUsed));

        })

        it(`Admin can't withdraw zero fee`, async () => {
            await expectRevert(socialBetsInstance.withdrawFee(), "No fee to withdraw");
        })

        it(`Admin can set mediation time limit`, async () => {
            let mediationTimeLimit = time.duration.days(3);
            await socialBetsInstance.setMediationTimeLimit(mediationTimeLimit);
            (await socialBetsInstance.mediationTimeLimit()).should.bignumber.equal(mediationTimeLimit);
        });

        it(`Admin can't set mediation time limit to zero address`, async () => {
            let mediationTimeLimit = new BN(`0`);
            await expectRevert(socialBetsInstance.setMediationTimeLimit(mediationTimeLimit),"Bad mediationTimeLimit");
        });
    });

    describe(`Bet creation test`, async () => {
        beforeEach(async () => {
            socialBetsInstance = await SocialBets.new(
                fee,
                minBetValue,
                defaultMediatorFee,
                defaultMediator
            );
        });
        it("First party can create private bet with custom mediator", async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            const firstTracker = await balance.tracker(firstPartyAddr);
            let res = await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            expectEvent(res, "NewBetCreated", {
                _metadata: metadata,
                _secondParty: secondPartyAddr,
                _mediator: mediatorAddr,
                _mediatorFee: mediatorFee,
                _firstBetValue: firstBetValue,
                _secondBetValue: secondBetValue,
                _secondPartyTimeframe: secondPartyTimeframe,
                _resultTimeframe: resultTimeframe
            });
            const gasUsed = new BN(res.receipt.gasUsed);
            (await firstTracker.delta()).should.bignumber.equal(firstBetValue.add(fee).add(gasUsed).neg());

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            (await socialBetsInstance.firstPartyActiveBets(firstPartyAddr, `0`)).should.bignumber.equal(betId);

            const bet = await socialBetsInstance.bets(betId);

            (bet.metadata).should.equal(metadata);
            (bet.firstParty).should.equal(firstPartyAddr);
            (bet.secondParty).should.equal(secondPartyAddr);
            (bet.mediator).should.equal(mediatorAddr);
            (bet.firstBetValue).should.bignumber.equal(firstBetValue);
            (bet.secondBetValue).should.bignumber.equal(secondBetValue);
            (bet.mediatorFee).should.bignumber.equal(mediatorFee);
            (bet.secondPartyTimeframe).should.bignumber.equal(secondPartyTimeframe);
            (bet.resultTimeframe).should.bignumber.equal(resultTimeframe);
            (bet.state).should.bignumber.equal(BetStates.WaitingParty2);
            (bet.firstPartyAnswer).should.bignumber.equal(Answers.Unset);
            (bet.secondPartyAnswer).should.bignumber.equal(Answers.Unset);

        });

        it("First party can create private bet with default mediator (pass default mediator)", async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = defaultMediator;
            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = defaultMediatorFee;
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            const firstTracker = await balance.tracker(firstPartyAddr);
            let res = await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            expectEvent(res, "NewBetCreated", {
                _metadata: metadata,
                _secondParty: secondPartyAddr,
                _mediator: mediatorAddr,
                _mediatorFee: mediatorFee,
                _firstBetValue: firstBetValue,
                _secondBetValue: secondBetValue,
                _secondPartyTimeframe: secondPartyTimeframe,
                _resultTimeframe: resultTimeframe
            });
            const gasUsed = new BN(res.receipt.gasUsed);
            (await firstTracker.delta()).should.bignumber.equal(firstBetValue.add(fee).add(gasUsed).neg());

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            (await socialBetsInstance.firstPartyActiveBets(firstPartyAddr, `0`)).should.bignumber.equal(betId);

            const bet = await socialBetsInstance.bets(betId);

            (bet.metadata).should.equal(metadata);
            (bet.firstParty).should.equal(firstPartyAddr);
            (bet.secondParty).should.equal(secondPartyAddr);
            (bet.mediator).should.equal(mediatorAddr);
            (bet.firstBetValue).should.bignumber.equal(firstBetValue);
            (bet.secondBetValue).should.bignumber.equal(secondBetValue);
            (bet.mediatorFee).should.bignumber.equal(mediatorFee);
            (bet.secondPartyTimeframe).should.bignumber.equal(secondPartyTimeframe);
            (bet.resultTimeframe).should.bignumber.equal(resultTimeframe);
            (bet.state).should.bignumber.equal(BetStates.WaitingParty2);
            (bet.firstPartyAnswer).should.bignumber.equal(Answers.Unset);
            (bet.secondPartyAnswer).should.bignumber.equal(Answers.Unset);


        });

        it("First party can create private bet with default mediator (pass zero addr as mediator and zero fee)", async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = defaultMediator;
            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = defaultMediatorFee;
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            const firstTracker = await balance.tracker(firstPartyAddr);
            let res = await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                constants.ZERO_ADDRESS, //! we pass there zero address, not mediator
                new BN(`0`), //! we pass there zero, not mediatorFee
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            expectEvent(res, "NewBetCreated", {
                _metadata: metadata,
                _secondParty: secondPartyAddr,
                _mediator: mediatorAddr,
                _mediatorFee: mediatorFee,
                _firstBetValue: firstBetValue,
                _secondBetValue: secondBetValue,
                _secondPartyTimeframe: secondPartyTimeframe,
                _resultTimeframe: resultTimeframe
            });
            const gasUsed = new BN(res.receipt.gasUsed);
            (await firstTracker.delta()).should.bignumber.equal(firstBetValue.add(fee).add(gasUsed).neg());

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            (await socialBetsInstance.firstPartyActiveBets(firstPartyAddr, `0`)).should.bignumber.equal(betId);

            const bet = await socialBetsInstance.bets(betId);

            (bet.metadata).should.equal(metadata);
            (bet.firstParty).should.equal(firstPartyAddr);
            (bet.secondParty).should.equal(secondPartyAddr);
            (bet.mediator).should.equal(mediatorAddr);
            (bet.firstBetValue).should.bignumber.equal(firstBetValue);
            (bet.secondBetValue).should.bignumber.equal(secondBetValue);
            (bet.mediatorFee).should.bignumber.equal(mediatorFee);
            (bet.secondPartyTimeframe).should.bignumber.equal(secondPartyTimeframe);
            (bet.resultTimeframe).should.bignumber.equal(resultTimeframe);
            (bet.state).should.bignumber.equal(BetStates.WaitingParty2);
            (bet.firstPartyAnswer).should.bignumber.equal(Answers.Unset);
            (bet.secondPartyAnswer).should.bignumber.equal(Answers.Unset);

        });

        it("First party can create public bet with custom mediator", async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = constants.ZERO_ADDRESS;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            const firstTracker = await balance.tracker(firstPartyAddr);
            let res = await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            expectEvent(res, "NewBetCreated", {
                _metadata: metadata,
                _secondParty: secondPartyAddr,
                _mediator: mediatorAddr,
                _mediatorFee: mediatorFee,
                _firstBetValue: firstBetValue,
                _secondBetValue: secondBetValue,
                _secondPartyTimeframe: secondPartyTimeframe,
                _resultTimeframe: resultTimeframe
            });
            const gasUsed = new BN(res.receipt.gasUsed);
            (await firstTracker.delta()).should.bignumber.equal(firstBetValue.add(fee).add(gasUsed).neg());

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            (await socialBetsInstance.firstPartyActiveBets(firstPartyAddr, `0`)).should.bignumber.equal(betId);

            const bet = await socialBetsInstance.bets(betId);

            (bet.metadata).should.equal(metadata);
            (bet.firstParty).should.equal(firstPartyAddr);
            (bet.secondParty).should.equal(secondPartyAddr);
            (bet.mediator).should.equal(mediatorAddr);
            (bet.firstBetValue).should.bignumber.equal(firstBetValue);
            (bet.secondBetValue).should.bignumber.equal(secondBetValue);
            (bet.mediatorFee).should.bignumber.equal(mediatorFee);
            (bet.secondPartyTimeframe).should.bignumber.equal(secondPartyTimeframe);
            (bet.resultTimeframe).should.bignumber.equal(resultTimeframe);
            (bet.state).should.bignumber.equal(BetStates.WaitingParty2);
            (bet.firstPartyAnswer).should.bignumber.equal(Answers.Unset);
            (bet.secondPartyAnswer).should.bignumber.equal(Answers.Unset);

        });

        it("First party can create public bet with default mediator (pass default mediator)", async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = constants.ZERO_ADDRESS;
            const mediatorAddr = defaultMediator;
            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = defaultMediatorFee;
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            const firstTracker = await balance.tracker(firstPartyAddr);
            let res = await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            expectEvent(res, "NewBetCreated", {
                _metadata: metadata,
                _secondParty: secondPartyAddr,
                _mediator: mediatorAddr,
                _mediatorFee: mediatorFee,
                _firstBetValue: firstBetValue,
                _secondBetValue: secondBetValue,
                _secondPartyTimeframe: secondPartyTimeframe,
                _resultTimeframe: resultTimeframe
            });
            const gasUsed = new BN(res.receipt.gasUsed);
            (await firstTracker.delta()).should.bignumber.equal(firstBetValue.add(fee).add(gasUsed).neg());

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            (await socialBetsInstance.firstPartyActiveBets(firstPartyAddr, `0`)).should.bignumber.equal(betId);

            const bet = await socialBetsInstance.bets(betId);

            (bet.metadata).should.equal(metadata);
            (bet.firstParty).should.equal(firstPartyAddr);
            (bet.secondParty).should.equal(secondPartyAddr);
            (bet.mediator).should.equal(mediatorAddr);
            (bet.firstBetValue).should.bignumber.equal(firstBetValue);
            (bet.secondBetValue).should.bignumber.equal(secondBetValue);
            (bet.mediatorFee).should.bignumber.equal(mediatorFee);
            (bet.secondPartyTimeframe).should.bignumber.equal(secondPartyTimeframe);
            (bet.resultTimeframe).should.bignumber.equal(resultTimeframe);
            (bet.state).should.bignumber.equal(BetStates.WaitingParty2);
            (bet.firstPartyAnswer).should.bignumber.equal(Answers.Unset);
            (bet.secondPartyAnswer).should.bignumber.equal(Answers.Unset);

        });

        it("First party can create public bet with default mediator (pass zero addr as mediator and zero fee)", async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = constants.ZERO_ADDRESS;
            const mediatorAddr = defaultMediator;
            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = defaultMediatorFee;
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            const firstTracker = await balance.tracker(firstPartyAddr);
            let res = await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                constants.ZERO_ADDRESS, //! we pass there zero address, not mediator
                new BN(`0`), //! we pass there zero, not mediatorFee
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            expectEvent(res, "NewBetCreated", {
                _metadata: metadata,
                _secondParty: secondPartyAddr,
                _mediator: mediatorAddr,
                _mediatorFee: mediatorFee,
                _firstBetValue: firstBetValue,
                _secondBetValue: secondBetValue,
                _secondPartyTimeframe: secondPartyTimeframe,
                _resultTimeframe: resultTimeframe
            });
            const gasUsed = new BN(res.receipt.gasUsed);
            (await firstTracker.delta()).should.bignumber.equal(firstBetValue.add(fee).add(gasUsed).neg());

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            (await socialBetsInstance.firstPartyActiveBets(firstPartyAddr, `0`)).should.bignumber.equal(betId);

            const bet = await socialBetsInstance.bets(betId);

            (bet.metadata).should.equal(metadata);
            (bet.firstParty).should.equal(firstPartyAddr);
            (bet.secondParty).should.equal(secondPartyAddr);
            (bet.mediator).should.equal(mediatorAddr);
            (bet.firstBetValue).should.bignumber.equal(firstBetValue);
            (bet.secondBetValue).should.bignumber.equal(secondBetValue);
            (bet.mediatorFee).should.bignumber.equal(mediatorFee);
            (bet.secondPartyTimeframe).should.bignumber.equal(secondPartyTimeframe);
            (bet.resultTimeframe).should.bignumber.equal(resultTimeframe);
            (bet.state).should.bignumber.equal(BetStates.WaitingParty2);
            (bet.firstPartyAnswer).should.bignumber.equal(Answers.Unset);
            (bet.secondPartyAnswer).should.bignumber.equal(Answers.Unset);

        });

        it("First party can't create private bet with second party the same as the first", async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await expectRevert(socialBetsInstance.createBet(
                metadata,
                firstPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            ), "Bad mediator or second party");


            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            const bet = await socialBetsInstance.bets(betId);
            (bet.firstParty).should.equal(constants.ZERO_ADDRESS);

        });

        it("First party can't create private bet with mediator the same as the first party", async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await expectRevert(socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                firstPartyAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            ), "Bad mediator or second party");


            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            const bet = await socialBetsInstance.bets(betId);
            (bet.firstParty).should.equal(constants.ZERO_ADDRESS);

        });

        it("First party can't create private bet with mediator the same as the second party", async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await expectRevert(socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                secondPartyAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            ), "Bad mediator or second party");


            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            const bet = await socialBetsInstance.bets(betId);
            (bet.firstParty).should.equal(constants.ZERO_ADDRESS);

        });

        it("First party can't create bet with too low ETH value", async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = constants.ZERO_ADDRESS;
            const mediatorAddr = defaultMediator;
            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`300`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await expectRevert(socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                constants.ZERO_ADDRESS,
                new BN(`0`),
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee).subn(1)
                }
            ), "Bad eth value");


            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            const bet = await socialBetsInstance.bets(betId);
            (bet.firstParty).should.equal(constants.ZERO_ADDRESS);
        });

        it("First party can't create bet with too high ETH value", async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = constants.ZERO_ADDRESS;
            const mediatorAddr = defaultMediator;
            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`300`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await expectRevert(socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                constants.ZERO_ADDRESS,
                new BN(`0`),
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee).addn(1)
                }
            ), "Bad eth value");


            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            const bet = await socialBetsInstance.bets(betId);
            (bet.firstParty).should.equal(constants.ZERO_ADDRESS);
        });

        it("First party can't create bet with first bet value lower than required minimum", async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = constants.ZERO_ADDRESS;
            const mediatorAddr = defaultMediator;
            const firstBetValue = minBetValue.subn(1);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`300`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await expectRevert(socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                constants.ZERO_ADDRESS,
                new BN(`0`),
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            ), "Too small bet value");


            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            const bet = await socialBetsInstance.bets(betId);
            (bet.firstParty).should.equal(constants.ZERO_ADDRESS);
        });

        it("First party can't create bet with second bet value lower than required minimum", async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = constants.ZERO_ADDRESS;
            const mediatorAddr = defaultMediator;
            const firstBetValue = ether('0.5');
            const secondBetValue = minBetValue.subn(1);
            const mediatorFee = new BN(`300`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await expectRevert(socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                constants.ZERO_ADDRESS,
                new BN(`0`),
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            ), "Too small bet value");


            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            const bet = await socialBetsInstance.bets(betId);
            (bet.firstParty).should.equal(constants.ZERO_ADDRESS);
        });

        it("First party can't create bet with 2nd party timeframe earlier than now", async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = constants.ZERO_ADDRESS;
            const mediatorAddr = defaultMediator;
            const firstBetValue = ether('0.5');
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`300`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).subn(1);
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await expectRevert(socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                constants.ZERO_ADDRESS,
                new BN(`0`),
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            ), "2nd party timeframe < now");


            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            const bet = await socialBetsInstance.bets(betId);
            (bet.firstParty).should.equal(constants.ZERO_ADDRESS);
        });

        it("First party can't create bet with result timeframe earlier than now", async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = constants.ZERO_ADDRESS;
            const mediatorAddr = defaultMediator;
            const firstBetValue = ether('0.5');
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`300`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).subn(1);

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await expectRevert(socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                constants.ZERO_ADDRESS,
                new BN(`0`),
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            ), "Result timeframe < now");


            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            const bet = await socialBetsInstance.bets(betId);
            (bet.firstParty).should.equal(constants.ZERO_ADDRESS);
        });

        it("First party can't create bet with result timeframe earlier than 2nd party timeframe", async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = constants.ZERO_ADDRESS;
            const mediatorAddr = defaultMediator;
            const firstBetValue = ether('0.5');
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`300`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = secondPartyTimeframe.subn(1);

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await expectRevert(socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                constants.ZERO_ADDRESS,
                new BN(`0`),
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            ), "Result < 2nd party timeframe");


            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            const bet = await socialBetsInstance.bets(betId);
            (bet.firstParty).should.equal(constants.ZERO_ADDRESS);
        });

        it("First party can't create bet with mediator fee greater than MEDIATOR_FEE_DIVISION", async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = MEDIATOR_FEE_DIVISION.addn(1);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await expectRevert(socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            ), "Bad mediator fee");


            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            const bet = await socialBetsInstance.bets(betId);
            (bet.firstParty).should.equal(constants.ZERO_ADDRESS);

        });

        it("First party can't create bet that is already exists", async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = constants.ZERO_ADDRESS;
            const mediatorAddr = defaultMediator;
            const firstBetValue = ether('0.5');
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`300`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                constants.ZERO_ADDRESS,
                new BN(`0`),
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );
            await expectRevert(socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                constants.ZERO_ADDRESS,
                new BN(`0`),
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            ), "Bet already exists");


            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            const bet = await socialBetsInstance.bets(betId);
            (bet.firstParty).should.equal(firstParty);
        });

    });

    describe(`Getters test`, async () => {
        beforeEach(async () => {
            socialBetsInstance = await SocialBets.new(
                fee,
                minBetValue,
                defaultMediatorFee,
                defaultMediator
            );
        });

        it(`First party active bets test (cancel bets)`, async () => {
            let firstBets = await socialBetsInstance.getFirstPartyActiveBets(firstParty);
            firstBets.length.should.equal(0);

            // create first bet
            let metadata = "some metadata";
            let firstPartyAddr = firstParty;
            let secondPartyAddr = secondParty;
            let mediatorAddr = mediator;
            let firstBetValue = ether(`0.5`);
            let secondBetValue = ether(`1.5`);
            let mediatorFee = new BN(`400`);
            let secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            let resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));
            let fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );
            let betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );


            firstBets = await socialBetsInstance.getFirstPartyActiveBets(firstPartyAddr);
            firstBets.length.should.equal(1);
            firstBets[0].should.bignumber.equal(betId);

            // create second bet
            metadata = "some metadata2";
            secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(10));
            resultTimeframe = (await getCurrentTimestamp()).add(duration.days(15));
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );
            let secondBetId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );


            firstBets = await socialBetsInstance.getFirstPartyActiveBets(firstPartyAddr);
            firstBets.length.should.equal(2);
            firstBets[1].should.bignumber.equal(secondBetId);

            //delete first bet
            await time.increaseTo((await getCurrentTimestamp()).add(duration.days(6)));
            await socialBetsInstance.party2TimeoutHandler(betId, {
                from: thirdParty
            });

            firstBets = await socialBetsInstance.getFirstPartyActiveBets(firstPartyAddr);
            firstBets.length.should.equal(1);
            firstBets[0].should.bignumber.equal(secondBetId);

            //delete second bet
            await time.increaseTo((await getCurrentTimestamp()).add(duration.days(6)));
            await socialBetsInstance.party2TimeoutHandler(secondBetId, {
                from: thirdParty
            });

            firstBets = await socialBetsInstance.getFirstPartyActiveBets(firstPartyAddr);
            firstBets.length.should.equal(0);
        });

        it(`Second party active bets test (cancel bets)`, async () => {
            let secondBets = await socialBetsInstance.getSecondPartyActiveBets(secondParty);
            secondBets.length.should.equal(0);

            // create first bet
            let metadata = "some metadata";
            let firstPartyAddr = firstParty;
            let secondPartyAddr = secondParty;
            let mediatorAddr = mediator;

            let firstBetValue = ether(`0.5`);
            let secondBetValue = ether(`1.5`);
            let mediatorFee = new BN(`400`);
            let secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            let resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            let fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            let betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });


            secondBets = await socialBetsInstance.getSecondPartyActiveBets(secondParty);
            secondBets.length.should.equal(1);
            secondBets[0].should.bignumber.equal(betId);


            metadata = "some metadata2";
            resultTimeframe = (await getCurrentTimestamp()).add(duration.days(20));
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const secondBetId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(secondBetId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            secondBets = await socialBetsInstance.getSecondPartyActiveBets(secondParty);
            secondBets.length.should.equal(2);
            secondBets[1].should.bignumber.equal(secondBetId);

            await time.increaseTo((await getCurrentTimestamp()).add(duration.days(11)));
            await socialBetsInstance.votesTimeoutHandler(betId, {
                from: thirdParty
            });

            secondBets = await socialBetsInstance.getSecondPartyActiveBets(secondParty);
            secondBets.length.should.equal(1);
            secondBets[0].should.bignumber.equal(secondBetId);

            await time.increaseTo((await getCurrentTimestamp()).add(duration.days(11)));
            await socialBetsInstance.votesTimeoutHandler(secondBetId, {
                from: thirdParty
            });

            secondBets = await socialBetsInstance.getSecondPartyActiveBets(secondParty);
            secondBets.length.should.equal(0);
        });

        it(`Mediator active bets test (cancel bets)`, async () => {
            let mediatorBets = await socialBetsInstance.getMediatorActiveBets(mediator);
            mediatorBets.length.should.equal(0);

            let metadata = "some metadata";
            let firstPartyAddr = firstParty;
            let secondPartyAddr = secondParty;
            let mediatorAddr = mediator;

            let firstBetValue = ether(`0.5`);
            let secondBetValue = ether(`1.5`);
            let mediatorFee = new BN(`400`);
            let secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            let resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            let fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            let betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            await socialBetsInstance.vote(betId, Answers.SecondPartyWins, {
                from: secondPartyAddr
            });

            mediatorBets = await socialBetsInstance.getMediatorActiveBets(mediator);
            mediatorBets.length.should.equal(1);
            mediatorBets[0].should.bignumber.equal(betId);


            metadata = "some metadata2";
            resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            let secondBetId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(secondBetId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(secondBetId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            await socialBetsInstance.vote(secondBetId, Answers.SecondPartyWins, {
                from: secondPartyAddr
            });


            mediatorBets = await socialBetsInstance.getMediatorActiveBets(mediator);
            mediatorBets.length.should.equal(2);
            mediatorBets[1].should.bignumber.equal(secondBetId);


            await time.increaseTo((await getCurrentTimestamp()).add(duration.days(18)));
            await socialBetsInstance.mediatorTimeoutHandler(betId, {
                from: thirdParty
            });

            mediatorBets = await socialBetsInstance.getMediatorActiveBets(mediator);
            mediatorBets.length.should.equal(1);
            mediatorBets[0].should.bignumber.equal(secondBetId);


            await time.increaseTo((await getCurrentTimestamp()).add(duration.days(18)));
            await socialBetsInstance.mediatorTimeoutHandler(secondBetId, {
                from: thirdParty
            });

            mediatorBets = await socialBetsInstance.getMediatorActiveBets(mediator);
            mediatorBets.length.should.equal(0);
        });

        it(`First party active bets test (finish bets)`, async () => {
            let firstBets = await socialBetsInstance.getFirstPartyActiveBets(firstParty);
            firstBets.length.should.equal(0);

            // create first bet
            let metadata = "some metadata";
            let firstPartyAddr = firstParty;
            let secondPartyAddr = secondParty;
            let mediatorAddr = mediator;
            let firstBetValue = ether(`0.5`);
            let secondBetValue = ether(`1.5`);
            let mediatorFee = new BN(`400`);
            let secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            let resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));
            let fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );
            let betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });



            firstBets = await socialBetsInstance.getFirstPartyActiveBets(firstPartyAddr);
            firstBets.length.should.equal(1);
            firstBets[0].should.bignumber.equal(betId);


            // create second bet
            metadata = "some metadata2";
            secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(10));
            resultTimeframe = (await getCurrentTimestamp()).add(duration.days(15));

            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );
            let secondBetId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(secondBetId, {
                from: secondPartyAddr,
                value: secondBetValue
            });
            await socialBetsInstance.vote(secondBetId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });



            firstBets = await socialBetsInstance.getFirstPartyActiveBets(firstPartyAddr);
            firstBets.length.should.equal(2);
            firstBets[1].should.bignumber.equal(secondBetId);


            //delete first bet
            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: secondPartyAddr
            });



            firstBets = await socialBetsInstance.getFirstPartyActiveBets(firstPartyAddr);
            firstBets.length.should.equal(1);
            firstBets[0].should.bignumber.equal(secondBetId);


            //delete second bet
            await socialBetsInstance.vote(secondBetId, Answers.FirstPartyWins, {
                from: secondPartyAddr
            });



            firstBets = await socialBetsInstance.getFirstPartyActiveBets(firstPartyAddr);
            firstBets.length.should.equal(0);
        });

        it(`Second party active bets test (finish bets)`, async () => {
            let secondBets = await socialBetsInstance.getSecondPartyActiveBets(secondParty);
            secondBets.length.should.equal(0);

            // create first bet
            let metadata = "some metadata";
            let firstPartyAddr = firstParty;
            let secondPartyAddr = secondParty;
            let mediatorAddr = mediator;

            let firstBetValue = ether(`0.5`);
            let secondBetValue = ether(`1.5`);
            let mediatorFee = new BN(`400`);
            let secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            let resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            let fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            let betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });


            secondBets = await socialBetsInstance.getSecondPartyActiveBets(secondParty);
            secondBets.length.should.equal(1);
            secondBets[0].should.bignumber.equal(betId);


            metadata = "some metadata2";
            resultTimeframe = (await getCurrentTimestamp()).add(duration.days(20));
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const secondBetId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(secondBetId, {
                from: secondPartyAddr,
                value: secondBetValue
            });
            await socialBetsInstance.vote(secondBetId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });


            secondBets = await socialBetsInstance.getSecondPartyActiveBets(secondParty);
            secondBets.length.should.equal(2);
            secondBets[1].should.bignumber.equal(secondBetId);


            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: secondPartyAddr
            });

            secondBets = await socialBetsInstance.getSecondPartyActiveBets(secondParty);
            secondBets.length.should.equal(1);
            secondBets[0].should.bignumber.equal(secondBetId);

            await socialBetsInstance.vote(secondBetId, Answers.FirstPartyWins, {
                from: secondPartyAddr
            });

            secondBets = await socialBetsInstance.getSecondPartyActiveBets(secondParty);
            secondBets.length.should.equal(0);
        });

        it(`Mediator active bets test (finish bets)`, async () => {
            let mediatorBets = await socialBetsInstance.getMediatorActiveBets(mediator);
            mediatorBets.length.should.equal(0);

            let metadata = "some metadata";
            let firstPartyAddr = firstParty;
            let secondPartyAddr = secondParty;
            let mediatorAddr = mediator;

            let firstBetValue = ether(`0.5`);
            let secondBetValue = ether(`1.5`);
            let mediatorFee = new BN(`400`);
            let secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            let resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            let fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            let betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            await socialBetsInstance.vote(betId, Answers.SecondPartyWins, {
                from: secondPartyAddr
            });

            mediatorBets = await socialBetsInstance.getMediatorActiveBets(mediator);
            mediatorBets.length.should.equal(1);
            mediatorBets[0].should.bignumber.equal(betId);


            metadata = "some metadata2";
            resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            let secondBetId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(secondBetId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(secondBetId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            await socialBetsInstance.vote(secondBetId, Answers.SecondPartyWins, {
                from: secondPartyAddr
            });


            mediatorBets = await socialBetsInstance.getMediatorActiveBets(mediator);
            mediatorBets.length.should.equal(2);
            mediatorBets[1].should.bignumber.equal(secondBetId);


            await socialBetsInstance.mediate(betId, Answers.FirstPartyWins, {
                from: mediatorAddr
            });

            mediatorBets = await socialBetsInstance.getMediatorActiveBets(mediator);
            mediatorBets.length.should.equal(1);
            mediatorBets[0].should.bignumber.equal(secondBetId);


            await socialBetsInstance.mediate(secondBetId, Answers.SecondPartyWins, {
                from: mediatorAddr
            });

            mediatorBets = await socialBetsInstance.getMediatorActiveBets(mediator);
            mediatorBets.length.should.equal(0);
        });

        it(`First party active bets test (cancel-finish bets)`, async () => {
            let firstBets = await socialBetsInstance.getFirstPartyActiveBets(firstParty);
            firstBets.length.should.equal(0);

            // create first bet
            let metadata = "some metadata";
            let firstPartyAddr = firstParty;
            let secondPartyAddr = secondParty;
            let mediatorAddr = mediator;
            let firstBetValue = ether(`0.5`);
            let secondBetValue = ether(`1.5`);
            let mediatorFee = new BN(`400`);
            let secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            let resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));
            let fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );
            let betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );


            firstBets = await socialBetsInstance.getFirstPartyActiveBets(firstPartyAddr);
            firstBets.length.should.equal(1);
            firstBets[0].should.bignumber.equal(betId);

            // create second bet
            metadata = "some metadata2";
            secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(10));
            resultTimeframe = (await getCurrentTimestamp()).add(duration.days(15));
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );
            let secondBetId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(secondBetId, {
                from: secondPartyAddr,
                value: secondBetValue
            });
            await socialBetsInstance.vote(secondBetId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });



            firstBets = await socialBetsInstance.getFirstPartyActiveBets(firstPartyAddr);
            firstBets.length.should.equal(2);
            firstBets[1].should.bignumber.equal(secondBetId);

            //delete first bet
            await time.increaseTo((await getCurrentTimestamp()).add(duration.days(6)));
            await socialBetsInstance.party2TimeoutHandler(betId, {
                from: thirdParty
            });

            firstBets = await socialBetsInstance.getFirstPartyActiveBets(firstPartyAddr);
            firstBets.length.should.equal(1);
            firstBets[0].should.bignumber.equal(secondBetId);

            //delete second bet
            await socialBetsInstance.vote(secondBetId, Answers.FirstPartyWins, {
                from: secondPartyAddr
            });


            firstBets = await socialBetsInstance.getFirstPartyActiveBets(firstPartyAddr);
            firstBets.length.should.equal(0);
        });

        it(`Second party active bets test (finish-cancel bets)`, async () => {
            let secondBets = await socialBetsInstance.getSecondPartyActiveBets(secondParty);
            secondBets.length.should.equal(0);

            let metadata = "some metadata";
            let firstPartyAddr = firstParty;
            let secondPartyAddr = secondParty;
            let mediatorAddr = mediator;

            let firstBetValue = ether(`0.5`);
            let secondBetValue = ether(`1.5`);
            let mediatorFee = new BN(`400`);
            let secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            let resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            let fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            let betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });


            secondBets = await socialBetsInstance.getSecondPartyActiveBets(secondParty);
            secondBets.length.should.equal(1);
            secondBets[0].should.bignumber.equal(betId);


            metadata = "some metadata2";
            resultTimeframe = (await getCurrentTimestamp()).add(duration.days(20));
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const secondBetId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(secondBetId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            secondBets = await socialBetsInstance.getSecondPartyActiveBets(secondParty);
            secondBets.length.should.equal(2);
            secondBets[1].should.bignumber.equal(secondBetId);

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: secondPartyAddr
            });

            secondBets = await socialBetsInstance.getSecondPartyActiveBets(secondParty);
            secondBets.length.should.equal(1);
            secondBets[0].should.bignumber.equal(secondBetId);

            await time.increaseTo((await getCurrentTimestamp()).add(duration.days(22)));
            await socialBetsInstance.votesTimeoutHandler(secondBetId, {
                from: thirdParty
            });

            secondBets = await socialBetsInstance.getSecondPartyActiveBets(secondParty);
            secondBets.length.should.equal(0);
        });

        it(`Mediator active bets test (cancel-finish bets)`, async () => {
            let mediatorBets = await socialBetsInstance.getMediatorActiveBets(mediator);
            mediatorBets.length.should.equal(0);

            let metadata = "some metadata";
            let firstPartyAddr = firstParty;
            let secondPartyAddr = secondParty;
            let mediatorAddr = mediator;

            let firstBetValue = ether(`0.5`);
            let secondBetValue = ether(`1.5`);
            let mediatorFee = new BN(`400`);
            let secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            let resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            let fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            let betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            await socialBetsInstance.vote(betId, Answers.SecondPartyWins, {
                from: secondPartyAddr
            });

            mediatorBets = await socialBetsInstance.getMediatorActiveBets(mediator);
            mediatorBets.length.should.equal(1);
            mediatorBets[0].should.bignumber.equal(betId);


            metadata = "some metadata2";
            resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            let secondBetId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(secondBetId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(secondBetId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            await socialBetsInstance.vote(secondBetId, Answers.SecondPartyWins, {
                from: secondPartyAddr
            });


            mediatorBets = await socialBetsInstance.getMediatorActiveBets(mediator);
            mediatorBets.length.should.equal(2);
            mediatorBets[1].should.bignumber.equal(secondBetId);


            await time.increaseTo((await getCurrentTimestamp()).add(duration.days(18)));
            await socialBetsInstance.mediatorTimeoutHandler(betId, {
                from: thirdParty
            });

            mediatorBets = await socialBetsInstance.getMediatorActiveBets(mediator);
            mediatorBets.length.should.equal(1);
            mediatorBets[0].should.bignumber.equal(secondBetId);


            await socialBetsInstance.mediate(secondBetId, Answers.SecondPartyWins, {
                from: mediatorAddr
            });

            mediatorBets = await socialBetsInstance.getMediatorActiveBets(mediator);
            mediatorBets.length.should.equal(0);
        });


        it(`Default mediator can set the winner in the correct timeframe`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = defaultMediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            await socialBetsInstance.vote(betId, Answers.SecondPartyWins, {
                from: secondPartyAddr
            });


            let firstBets = await socialBetsInstance.getFirstPartyActiveBets(firstPartyAddr);
            let secondBets = await socialBetsInstance.getSecondPartyActiveBets(secondPartyAddr);
            let mediatorBets = await socialBetsInstance.getMediatorActiveBets(mediatorAddr);

            firstBets.length.should.equal(1);
            secondBets.length.should.equal(1);
            mediatorBets.length.should.equal(1);

            firstBets[0].should.bignumber.equal(betId);
            secondBets[0].should.bignumber.equal(betId);
            mediatorBets[0].should.bignumber.equal(betId);


            let mediatorFeeValue = await socialBetsInstance.calculateMediatorFee(betId);

            let mediatorTracker = await balance.tracker(mediatorAddr);
            let firstPartyTracker = await balance.tracker(firstPartyAddr);
            let secondPartyTracker = await balance.tracker(secondPartyAddr);


            let res = await socialBetsInstance.mediate(betId, Answers.FirstPartyWins, {
                from: defaultMediator
            });

            const gasUsed = new BN(res.receipt.gasUsed);
            expectEvent(res, "Finished", {
                _betId: betId,
                _winner: firstPartyAddr,
                _reason: BetFinishReasons.MediatorFinished,
                _reward: firstBetValue.add(secondBetValue).sub(mediatorFeeValue)
            });

            (await mediatorTracker.delta()).should.bignumber.equal(mediatorFeeValue.sub(gasUsed));
            (await firstPartyTracker.delta()).should.bignumber.equal(firstBetValue.add(secondBetValue).sub(mediatorFeeValue));
            (await secondPartyTracker.delta()).should.bignumber.equal(`0`);
        });
    });

    describe(`Second party participating`, async () => {
        beforeEach(async () => {
            socialBetsInstance = await SocialBets.new(
                fee,
                minBetValue,
                defaultMediatorFee,
                defaultMediator
            );
        });
        it(`Second party can participate in the correct timeframe in the private bet`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            const secondTracker = await balance.tracker(secondPartyAddr);

            let res = await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });
            const gasUsed = new BN(res.receipt.gasUsed);

            (await secondTracker.delta()).should.bignumber.equal(secondBetValue.add(gasUsed).neg());

            expectEvent(res, "SecondPartyParticipated", {
                _betId: betId,
                _firstParty: firstPartyAddr,
                _secondParty: secondPartyAddr
            });
            (await socialBetsInstance.secondPartyActiveBets(secondPartyAddr, `0`)).should.bignumber.equal(betId);

            const bet = await socialBetsInstance.bets(betId);

            (bet.secondParty).should.equal(secondPartyAddr);
            (bet.state).should.bignumber.equal(BetStates.WaitingFirstVote);
        });

        it(`Second party can participate in the correct timeframe in the public bet`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                constants.ZERO_ADDRESS, //! we pass zero address here to create public bet
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            const secondTracker = await balance.tracker(secondPartyAddr);

            let res = await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });
            (await socialBetsInstance.secondPartyActiveBets(secondPartyAddr, `0`)).should.bignumber.equal(betId);
            const gasUsed = new BN(res.receipt.gasUsed);

            (await secondTracker.delta()).should.bignumber.equal(secondBetValue.add(gasUsed).neg());

            expectEvent(res, "SecondPartyParticipated", {
                _betId: betId,
                _firstParty: firstPartyAddr,
                _secondParty: secondPartyAddr
            });

            const bet = await socialBetsInstance.bets(betId);

            (bet.secondParty).should.equal(secondPartyAddr);
            (bet.state).should.bignumber.equal(BetStates.WaitingFirstVote);
        });

        it(`First party can't participate in the public bet`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                constants.ZERO_ADDRESS, //! we pass zero address here to create public bet
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            const secondTracker = await balance.tracker(secondPartyAddr);

            await expectRevert(socialBetsInstance.participate(betId, {
                from: firstPartyAddr,
                value: secondBetValue
            }), "You are first party or mediator");

        });

        it(`Mediator can't participate as the second party in the bet`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                constants.ZERO_ADDRESS, //! we pass zero address here to create public bet
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            const secondTracker = await balance.tracker(secondPartyAddr);

            await expectRevert(socialBetsInstance.participate(betId, {
                from: mediatorAddr,
                value: secondBetValue
            }), "You are first party or mediator");

        });

        it(`Second party can't participate in the not existing bet`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            await expectRevert(socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            }), "Bet doesn't exist");


            const bet = await socialBetsInstance.bets(betId);
            (bet.firstParty).should.equal(constants.ZERO_ADDRESS);
        });

        it(`Second party can't participate if bet isn't waiting for the second party`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                constants.ZERO_ADDRESS, // create public bet
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );


            let res = await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            expectEvent(res, "SecondPartyParticipated", {
                _betId: betId,
                _firstParty: firstPartyAddr,
                _secondParty: secondPartyAddr
            });
            const bet = await socialBetsInstance.bets(betId);

            (bet.secondParty).should.equal(secondPartyAddr);
            (bet.state).should.bignumber.equal(BetStates.WaitingFirstVote);

            await expectRevert(socialBetsInstance.participate(betId, {
                from: publicSecondParty,
                value: secondBetValue
            }), "Party 2 already joined");

        });

        it(`Random second party can't participate in the private bet`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );


            await expectRevert(socialBetsInstance.participate(betId, {
                from: publicSecondParty,
                value: secondBetValue
            }), "Private bet");
        });

        it(`Second party can't participate when sending too low ETH value`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );


            await expectRevert(socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue.subn(1)
            }), "Bad eth value");

        });

        it(`Second party can't participate when sending too high ETH value`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );


            await expectRevert(socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue.addn(1)
            }), "Bad eth value");

        });

        it(`Second party can't participate when the timeframe is passed`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            const secondTracker = await balance.tracker(secondPartyAddr);
            await time.increaseTo(secondPartyTimeframe.add(duration.days(1)));

            let success = await socialBetsInstance.participate.call(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            success.should.equal(false);

            let res = await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });
            const gasUsed = new BN(res.receipt.gasUsed);

            (await secondTracker.delta()).should.bignumber.equal(gasUsed.neg());

            expectEvent(res, "Cancelled", {
                _betId: betId,
                _reason: BetCancellationReasons.Party2Timeout
            });
        });

    });

    describe(`Second party timeout handler`, async () => {
        beforeEach(async () => {
            socialBetsInstance = await SocialBets.new(
                fee,
                minBetValue,
                defaultMediatorFee,
                defaultMediator
            );
        });
        it(`Handler called by anyone cancels the bet if second party timeframe is passed`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            const firstTracker = await balance.tracker(firstPartyAddr);
            const secondTracker = await balance.tracker(secondPartyAddr);
            const thirdTracker = await balance.tracker(thirdParty);
            await time.increaseTo(secondPartyTimeframe.add(duration.days(1)));

            let res = await socialBetsInstance.party2TimeoutHandler(betId, {
                from: thirdParty
            });
            const gasUsed = new BN(res.receipt.gasUsed);

            (await thirdTracker.delta()).should.bignumber.equal(gasUsed.neg());
            (await firstTracker.delta()).should.bignumber.equal(firstBetValue);
            (await secondTracker.delta()).should.bignumber.equal('0');
            expectEvent(res, "Cancelled", {
                _betId: betId,
                _reason: BetCancellationReasons.Party2Timeout
            });
        });
        it(`Handler reverts if bet doesn't exist`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));


            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            await time.increaseTo(secondPartyTimeframe.add(duration.days(1)));

            await expectRevert(socialBetsInstance.party2TimeoutHandler(betId, {
                from: thirdParty
            }), "Bet doesn't exist");

        });
        it(`Handler reverts if bet isn't waiting second party`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            const secondTracker = await balance.tracker(secondPartyAddr);

            let res = await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });
            const gasUsed = new BN(res.receipt.gasUsed);

            (await secondTracker.delta()).should.bignumber.equal(secondBetValue.add(gasUsed).neg());

            expectEvent(res, "SecondPartyParticipated", {
                _betId: betId,
                _firstParty: firstPartyAddr,
                _secondParty: secondPartyAddr
            });

            const bet = await socialBetsInstance.bets(betId);

            (bet.secondParty).should.equal(secondPartyAddr);

            await expectRevert(socialBetsInstance.party2TimeoutHandler(betId, {
                from: thirdParty
            }), "Bet isn't waiting for party 2");
        });
        it(`Handler reverts if there is time left (no timeout)`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            await expectRevert(socialBetsInstance.party2TimeoutHandler(betId, {
                from: thirdParty
            }), "There is no timeout");
        });
    });

    describe(`1st vote test`, async () => {
        beforeEach(async () => {
            socialBetsInstance = await SocialBets.new(
                fee,
                minBetValue,
                defaultMediatorFee,
                defaultMediator
            );
        });
        it(`First party can vote in the correct timeframe`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            let res = await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            expectEvent(res, "Voted", {
                _betId: betId,
                _voter: firstPartyAddr,
                _answer: Answers.FirstPartyWins
            });

            const bet = await socialBetsInstance.bets(betId);

            (bet.firstPartyAnswer).should.bignumber.equal(Answers.FirstPartyWins);
            (bet.state).should.bignumber.equal(BetStates.WaitingSecondVote);
        });
        it(`Second party can vote in the correct timeframe`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            let res = await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: secondPartyAddr
            });

            expectEvent(res, "Voted", {
                _betId: betId,
                _voter: secondPartyAddr,
                _answer: Answers.FirstPartyWins
            });

            const bet = await socialBetsInstance.bets(betId);

            (bet.secondPartyAnswer).should.bignumber.equal(Answers.FirstPartyWins);
            (bet.state).should.bignumber.equal(BetStates.WaitingSecondVote);
        });
        it(`Player can't vote if bet doesn't exist`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );


            await expectRevert(socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: secondPartyAddr
            }), "Bet doesn't exist");
        });
        it(`Player can't change answer`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });
            let res = await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: secondPartyAddr
            });
            await expectRevert(socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: secondPartyAddr
            }), "You can't change your answer");
        });
        it(`Player can't vote with the "Unset" answer`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await expectRevert(socialBetsInstance.vote(betId, Answers.Unset, {
                from: secondPartyAddr
            }), "Wrong answer");
        });
        it(`Player can't vote if bet isn't waiting for votes`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            await expectRevert(socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: secondPartyAddr
            }), "Bet isn't waiting for votes");
        });
        it(`Not a bet's player can't vote`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await expectRevert(socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: thirdParty
            }), "You aren't participating");
        });
        it(`Bet is cancelled if answer timeframe is over`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await time.increaseTo(resultTimeframe.add(duration.days(1)));

            let res = await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: secondPartyAddr
            });

            expectEvent(res, "Cancelled", {
                _betId: betId,
                _reason: BetCancellationReasons.VotesTimeout
            });
        });
    });

    describe(`1st vote timeout handler`, async () => {
        beforeEach(async () => {
            socialBetsInstance = await SocialBets.new(
                fee,
                minBetValue,
                defaultMediatorFee,
                defaultMediator
            );
        });
        it(`Bet is cancelled if answer timeframe is over`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await time.increaseTo(resultTimeframe.add(duration.days(1)));

            let res = await socialBetsInstance.votesTimeoutHandler(betId, {
                from: thirdParty
            });

            expectEvent(res, "Cancelled", {
                _betId: betId,
                _reason: BetCancellationReasons.VotesTimeout
            });
        });
        it(`Handler can't be called if bet doesn't exist`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            await time.increaseTo(resultTimeframe.add(duration.days(1)));

            await expectRevert(socialBetsInstance.votesTimeoutHandler(betId, {
                from: thirdParty
            }), "Bet doesn't exist");
        });
        it(`Handler can't be called if bet isn't waiting for votes`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            await time.increaseTo(resultTimeframe.add(duration.days(1)));

            await expectRevert(socialBetsInstance.votesTimeoutHandler(betId, {
                from: thirdParty
            }), "Bet isn't waiting for votes");
        });

        it(`Handler can't be called if there is no timeout`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });
            await expectRevert(socialBetsInstance.votesTimeoutHandler(betId, {
                from: thirdParty
            }), "There is no timeout");
        });

    });

    describe(`2nd vote test `, async () => {
        beforeEach(async () => {
            socialBetsInstance = await SocialBets.new(
                fee,
                minBetValue,
                defaultMediatorFee,
                defaultMediator
            );
        });
        it(`Second party can vote the same answer after the first party in the correct timeframe`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            let res = await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: secondPartyAddr
            });

            expectEvent(res, "Voted", {
                _betId: betId,
                _voter: secondPartyAddr,
                _answer: Answers.FirstPartyWins
            });
            expectEvent(res, "Finished", {
                _betId: betId,
                _winner: firstPartyAddr,
                _reason: BetFinishReasons.AnswersMatched,
                _reward: firstBetValue.add(secondBetValue)
            });

        });
        it(`First party can vote the same answer after the second party in the correct timeframe`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: secondPartyAddr
            });

            let res = await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            expectEvent(res, "Voted", {
                _betId: betId,
                _voter: firstPartyAddr,
                _answer: Answers.FirstPartyWins
            });

            expectEvent(res, "Finished", {
                _betId: betId,
                _winner: firstPartyAddr,
                _reason: BetFinishReasons.AnswersMatched,
                _reward: firstBetValue.add(secondBetValue)
            });

        });
        it(`Second party can vote different answer after the first party in the correct timeframe`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            let res = await socialBetsInstance.vote(betId, Answers.SecondPartyWins, {
                from: secondPartyAddr
            });

            expectEvent(res, "Voted", {
                _betId: betId,
                _voter: secondPartyAddr,
                _answer: Answers.SecondPartyWins
            });
            (await socialBetsInstance.mediatorActiveBets(mediatorAddr, `0`)).should.bignumber.equal(betId);

            expectEvent(res, "WaitingMediator", {
                _betId: betId,
                _mediator: mediatorAddr
            });

            const bet = await socialBetsInstance.bets(betId);

            (bet.secondPartyAnswer).should.bignumber.equal(Answers.SecondPartyWins);
            (bet.state).should.bignumber.equal(BetStates.WaitingMediator);

        });
        it(`First party can vote different answer after the second party in the correct timeframe`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: secondPartyAddr
            });

            let res = await socialBetsInstance.vote(betId, Answers.Tie, {
                from: firstPartyAddr
            });

            expectEvent(res, "Voted", {
                _betId: betId,
                _voter: firstPartyAddr,
                _answer: Answers.Tie
            });

            expectEvent(res, "WaitingMediator", {
                _betId: betId,
                _mediator: mediatorAddr
            });
            (await socialBetsInstance.mediatorActiveBets(mediatorAddr, `0`)).should.bignumber.equal(betId);

            const bet = await socialBetsInstance.bets(betId);

            (bet.firstPartyAnswer).should.bignumber.equal(Answers.Tie);
            (bet.state).should.bignumber.equal(BetStates.WaitingMediator);


        });
        it(`Player can't vote if bet isn't waiting for votes`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            await socialBetsInstance.vote(betId, Answers.SecondPartyWins, {
                from: secondPartyAddr
            });

            await expectRevert(socialBetsInstance.vote(betId, Answers.SecondPartyWins, {
                from: secondPartyAddr
            }), "Bet isn't waiting for votes");
        });
        it(`Not a bet's player can't vote`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            await expectRevert(socialBetsInstance.vote(betId, Answers.SecondPartyWins, {
                from: thirdParty
            }), "You aren't participating");
        });
        it(`Bet is waiting for mediator if answer timeframe is over`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            await time.increaseTo(resultTimeframe.add(duration.days(1)));

            let res = await socialBetsInstance.vote(betId, Answers.Tie, {
                from: firstPartyAddr
            });
            (await socialBetsInstance.mediatorActiveBets(mediatorAddr, `0`)).should.bignumber.equal(betId);

            expectEvent(res, "WaitingMediator", {
                _betId: betId,
                _mediator: mediatorAddr
            });

            const bet = await socialBetsInstance.bets(betId);

            (bet.state).should.bignumber.equal(BetStates.WaitingMediator);

        });
    });

    describe(`2nd vote timeout handler`, async () => {
        beforeEach(async () => {
            socialBetsInstance = await SocialBets.new(
                fee,
                minBetValue,
                defaultMediatorFee,
                defaultMediator
            );
        });
        it(`Bet is waiting for the mediator if answer timeframe is over`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });


            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            await time.increaseTo(resultTimeframe.add(duration.days(1)));

            let res = await socialBetsInstance.votesTimeoutHandler(betId, {
                from: thirdParty
            });
            (await socialBetsInstance.mediatorActiveBets(mediatorAddr, `0`)).should.bignumber.equal(betId);

            expectEvent(res, "WaitingMediator", {
                _betId: betId,
                _mediator: mediatorAddr
            });
            const bet = await socialBetsInstance.bets(betId);

            (bet.state).should.bignumber.equal(BetStates.WaitingMediator);

        });
        it(`Handler can't be called if bet doesn't exist`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );



            await expectRevert(socialBetsInstance.votesTimeoutHandler(betId, {
                from: thirdParty
            }), "Bet doesn't exist");
        });
        it(`Handler can't be called if there is no timeout`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });


            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });


            await expectRevert(socialBetsInstance.votesTimeoutHandler(betId, {
                from: thirdParty
            }), "There is no timeout");
        });
        it(`Handler can't be called if bet isn't waiting for votes`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            await socialBetsInstance.vote(betId, Answers.SecondPartyWins, {
                from: secondPartyAddr
            });

            await time.increaseTo(resultTimeframe.add(duration.days(1)));

            await expectRevert(socialBetsInstance.votesTimeoutHandler(betId, {
                from: thirdParty
            }), "Bet isn't waiting for votes");
        });
    });

    describe(`Mediation test `, async () => {
        beforeEach(async () => {
            socialBetsInstance = await SocialBets.new(
                fee,
                minBetValue,
                defaultMediatorFee,
                defaultMediator
            );
        });
        it(`Default mediator can set the winner in the correct timeframe`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = defaultMediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            await socialBetsInstance.vote(betId, Answers.SecondPartyWins, {
                from: secondPartyAddr
            });

            let mediatorFeeValue = await socialBetsInstance.calculateMediatorFee(betId);

            let mediatorTracker = await balance.tracker(mediatorAddr);
            let firstPartyTracker = await balance.tracker(firstPartyAddr);
            let secondPartyTracker = await balance.tracker(secondPartyAddr);

            let res = await socialBetsInstance.mediate(betId, Answers.FirstPartyWins, {
                from: defaultMediator
            });

            const gasUsed = new BN(res.receipt.gasUsed);
            expectEvent(res, "Finished", {
                _betId: betId,
                _winner: firstPartyAddr,
                _reason: BetFinishReasons.MediatorFinished,
                _reward: firstBetValue.add(secondBetValue).sub(mediatorFeeValue)
            });

            (await mediatorTracker.delta()).should.bignumber.equal(mediatorFeeValue.sub(gasUsed));
            (await firstPartyTracker.delta()).should.bignumber.equal(firstBetValue.add(secondBetValue).sub(mediatorFeeValue));
            (await secondPartyTracker.delta()).should.bignumber.equal(`0`);
        });
        it(`Mediator can't set the Unset answer`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = defaultMediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            await socialBetsInstance.vote(betId, Answers.SecondPartyWins, {
                from: secondPartyAddr
            });


            await expectRevert(socialBetsInstance.mediate(betId, Answers.Unset, {
                from: defaultMediator
            }), "Wrong answer");

        });
        it(`Mediator can't mediate when bet isn't waiting for the mediator`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = defaultMediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });


            await expectRevert(socialBetsInstance.mediate(betId, Answers.FirstPartyWins, {
                from: defaultMediator
            }), "Bet isn't waiting for mediator");

        });
        it(`User's arbitrary mediator can set the winner in the correct timeframe`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            await socialBetsInstance.vote(betId, Answers.SecondPartyWins, {
                from: secondPartyAddr
            });

            let mediatorFeeValue = await socialBetsInstance.calculateMediatorFee(betId);

            let mediatorTracker = await balance.tracker(mediatorAddr);
            let firstPartyTracker = await balance.tracker(firstPartyAddr);
            let secondPartyTracker = await balance.tracker(secondPartyAddr);

            let res = await socialBetsInstance.mediate(betId, Answers.SecondPartyWins, {
                from: mediatorAddr
            })

            const gasUsed = new BN(res.receipt.gasUsed);
            expectEvent(res, "Finished", {
                _betId: betId,
                _winner: secondPartyAddr,
                _reason: BetFinishReasons.MediatorFinished,
                _reward: firstBetValue.add(secondBetValue).sub(mediatorFeeValue)
            });

            (await mediatorTracker.delta()).should.bignumber.equal(mediatorFeeValue.sub(gasUsed));
            (await firstPartyTracker.delta()).should.bignumber.equal(`0`);
            (await secondPartyTracker.delta()).should.bignumber.equal(firstBetValue.add(secondBetValue).sub(mediatorFeeValue));
        });
        it(`Not existing bet can't be mediated`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            await expectRevert(socialBetsInstance.mediate(betId, Answers.SecondPartyWins, {
                from: mediatorAddr
            }), "Bet doesn't exist");
        });
        it(`Not a bet's mediator can't mediate`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            await socialBetsInstance.vote(betId, Answers.SecondPartyWins, {
                from: secondPartyAddr
            });

            await expectRevert(socialBetsInstance.mediate(betId, Answers.SecondPartyWins, {
                from: thirdParty
            }), "You can't mediate this bet");
        });
        it(`If time for mediaton is over then bet is cancelling`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            await socialBetsInstance.vote(betId, Answers.SecondPartyWins, {
                from: secondPartyAddr
            });

            await time.increaseTo(resultTimeframe.add(duration.days(8)));
            let mediatorTracker = await balance.tracker(mediatorAddr);

            let res = await socialBetsInstance.mediate(betId, Answers.SecondPartyWins, {
                from: mediatorAddr
            });

            const gasUsed = new BN(res.receipt.gasUsed);
            expectEvent(res, "Cancelled", {
                _betId: betId,
                _reason: BetCancellationReasons.MediatorTimeout,
            });

            (await mediatorTracker.delta()).should.bignumber.equal(gasUsed.neg());
        });
    });

    describe(`Mediator timeout handler test `, async () => {
        beforeEach(async () => {
            socialBetsInstance = await SocialBets.new(
                fee,
                minBetValue,
                defaultMediatorFee,
                defaultMediator
            );
        });
        it(`If time for mediaton is over then bet is cancelling`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            await socialBetsInstance.vote(betId, Answers.SecondPartyWins, {
                from: secondPartyAddr
            });

            await time.increaseTo(resultTimeframe.add(duration.days(8)));
            let mediatorTracker = await balance.tracker(mediatorAddr);

            let res = await socialBetsInstance.mediatorTimeoutHandler(betId, {
                from: mediatorAddr
            });
            expectEvent(res, "Cancelled", {
                _betId: betId,
                _reason: BetCancellationReasons.MediatorTimeout,
            });
        });
        it(`Handler can't be called if bet doesn't exist`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            await time.increaseTo(resultTimeframe.add(duration.days(8)));

            await expectRevert(socialBetsInstance.mediatorTimeoutHandler(betId, {
                from: thirdParty
            }), "Bet doesn't exist");
        });
        it(`Handler can't be called if there is no timeout`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            await socialBetsInstance.vote(betId, Answers.SecondPartyWins, {
                from: secondPartyAddr
            });


            await expectRevert(socialBetsInstance.mediatorTimeoutHandler(betId, {
                from: thirdParty
            }), "There is no timeout");
        });
        it(`Handler can't be called if bet isn't waiting for mediator`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });


            await time.increaseTo(resultTimeframe.add(duration.days(8)));

            await expectRevert(socialBetsInstance.mediatorTimeoutHandler(betId, {
                from: thirdParty
            }), "Bet isn't waiting for mediator");
        });
    });

    describe(`Finishing bet test`, async () => {
        beforeEach(async () => {
            socialBetsInstance = await SocialBets.new(
                fee,
                minBetValue,
                defaultMediatorFee,
                defaultMediator
            );
        });
        it(`Bet can be finished by mediator`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = defaultMediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            await socialBetsInstance.vote(betId, Answers.SecondPartyWins, {
                from: secondPartyAddr
            });

            let mediatorFeeValue = await socialBetsInstance.calculateMediatorFee(betId);

            let mediatorTracker = await balance.tracker(mediatorAddr);
            let firstPartyTracker = await balance.tracker(firstPartyAddr);
            let secondPartyTracker = await balance.tracker(secondPartyAddr);

            let res = await socialBetsInstance.mediate(betId, Answers.FirstPartyWins, {
                from: defaultMediator
            });

            const gasUsed = new BN(res.receipt.gasUsed);
            expectEvent(res, "Finished", {
                _betId: betId,
                _winner: firstPartyAddr,
                _reason: BetFinishReasons.MediatorFinished,
                _reward: firstBetValue.add(secondBetValue).sub(mediatorFeeValue)
            });
            expectEvent(res,"Completed",{
                _firstParty:firstPartyAddr,
                _secondParty:secondPartyAddr,
                _mediator:mediatorAddr,
                _betId:betId
            });

            (await mediatorTracker.delta()).should.bignumber.equal(mediatorFeeValue.sub(gasUsed));
            (await firstPartyTracker.delta()).should.bignumber.equal(firstBetValue.add(secondBetValue).sub(mediatorFeeValue));
            (await secondPartyTracker.delta()).should.bignumber.equal(`0`);


            const bet = await socialBetsInstance.bets(betId);

            (bet.metadata).should.equal(``);
            (bet.firstParty).should.equal(constants.ZERO_ADDRESS);
            (bet.secondParty).should.equal(constants.ZERO_ADDRESS);
            (bet.mediator).should.equal(constants.ZERO_ADDRESS);
            (bet.firstBetValue).should.bignumber.equal(new BN(`0`));
            (bet.secondBetValue).should.bignumber.equal(new BN(`0`));
            (bet.mediatorFee).should.bignumber.equal(new BN(`0`));
            (bet.secondPartyTimeframe).should.bignumber.equal(new BN(`0`));
            (bet.resultTimeframe).should.bignumber.equal(new BN(`0`));
            (bet.state).should.bignumber.equal(new BN(`0`));
            (bet.firstPartyAnswer).should.bignumber.equal(new BN(`0`));
            (bet.secondPartyAnswer).should.bignumber.equal(new BN(`0`));
        });
        it(`Bet will be cancelled if mediator set the tie result`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = defaultMediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            await socialBetsInstance.vote(betId, Answers.SecondPartyWins, {
                from: secondPartyAddr
            });

            let mediatorFeeValue = await socialBetsInstance.calculateMediatorFee(betId);

            let mediatorTracker = await balance.tracker(mediatorAddr);
            let firstPartyTracker = await balance.tracker(firstPartyAddr);
            let secondPartyTracker = await balance.tracker(secondPartyAddr);

            let res = await socialBetsInstance.mediate(betId, Answers.Tie, {
                from: mediatorAddr
            });

            const gasUsed = new BN(res.receipt.gasUsed);
            expectEvent(res, "Cancelled", {
                _betId: betId,
                _reason: BetCancellationReasons.MediatorCancelled,
            });
            expectEvent(res,"Completed",{
                _firstParty:firstPartyAddr,
                _secondParty:secondPartyAddr,
                _mediator:mediatorAddr,
                _betId:betId
            });

            (await mediatorTracker.delta()).should.bignumber.equal(mediatorFeeValue.sub(gasUsed));
            let firstMediatorFee = mediatorFeeValue.divn(`2`);
            let secondMediatorFee = mediatorFeeValue.sub(firstMediatorFee);
            (await firstPartyTracker.delta()).should.bignumber.equal(firstBetValue.sub(firstMediatorFee));
            (await secondPartyTracker.delta()).should.bignumber.equal(secondBetValue.sub(secondMediatorFee));

            const bet = await socialBetsInstance.bets(betId);

            (bet.metadata).should.equal(``);
            (bet.firstParty).should.equal(constants.ZERO_ADDRESS);
            (bet.secondParty).should.equal(constants.ZERO_ADDRESS);
            (bet.mediator).should.equal(constants.ZERO_ADDRESS);
            (bet.firstBetValue).should.bignumber.equal(new BN(`0`));
            (bet.secondBetValue).should.bignumber.equal(new BN(`0`));
            (bet.mediatorFee).should.bignumber.equal(new BN(`0`));
            (bet.secondPartyTimeframe).should.bignumber.equal(new BN(`0`));
            (bet.resultTimeframe).should.bignumber.equal(new BN(`0`));
            (bet.state).should.bignumber.equal(new BN(`0`));
            (bet.firstPartyAnswer).should.bignumber.equal(new BN(`0`));
            (bet.secondPartyAnswer).should.bignumber.equal(new BN(`0`));
        });
        it(`Bet will be finished if answers matched`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            let mediatorTracker = await balance.tracker(mediatorAddr);
            let firstPartyTracker = await balance.tracker(firstPartyAddr);
            let secondPartyTracker = await balance.tracker(secondPartyAddr);

            let res = await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: secondPartyAddr
            });
            const gasUsed = new BN(res.receipt.gasUsed);

            expectEvent(res, "Finished", {
                _betId: betId,
                _winner: firstPartyAddr,
                _reason: BetFinishReasons.AnswersMatched,
                _reward: firstBetValue.add(secondBetValue)
            });
            expectEvent(res,"Completed",{
                _firstParty:firstPartyAddr,
                _secondParty:secondPartyAddr,
                _mediator:mediatorAddr,
                _betId:betId
            });

            (await mediatorTracker.delta()).should.bignumber.equal(new BN(`0`));
            (await firstPartyTracker.delta()).should.bignumber.equal(firstBetValue.add(secondBetValue));
            (await secondPartyTracker.delta()).should.bignumber.equal(gasUsed.neg());


            const bet = await socialBetsInstance.bets(betId);

            (bet.metadata).should.equal(``);
            (bet.firstParty).should.equal(constants.ZERO_ADDRESS);
            (bet.secondParty).should.equal(constants.ZERO_ADDRESS);
            (bet.mediator).should.equal(constants.ZERO_ADDRESS);
            (bet.firstBetValue).should.bignumber.equal(new BN(`0`));
            (bet.secondBetValue).should.bignumber.equal(new BN(`0`));
            (bet.mediatorFee).should.bignumber.equal(new BN(`0`));
            (bet.secondPartyTimeframe).should.bignumber.equal(new BN(`0`));
            (bet.resultTimeframe).should.bignumber.equal(new BN(`0`));
            (bet.state).should.bignumber.equal(new BN(`0`));
            (bet.firstPartyAnswer).should.bignumber.equal(new BN(`0`));
            (bet.secondPartyAnswer).should.bignumber.equal(new BN(`0`));

        });
        it(`Bet will be cancelled if result is tie`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.Tie, {
                from: firstPartyAddr
            });

            let mediatorTracker = await balance.tracker(mediatorAddr);
            let firstPartyTracker = await balance.tracker(firstPartyAddr);
            let secondPartyTracker = await balance.tracker(secondPartyAddr);

            let res = await socialBetsInstance.vote(betId, Answers.Tie, {
                from: secondPartyAddr
            });
            const gasUsed = new BN(res.receipt.gasUsed);

            expectEvent(res, "Cancelled", {
                _betId: betId,
                _reason: BetCancellationReasons.Tie,
            });
            expectEvent(res,"Completed",{
                _firstParty:firstPartyAddr,
                _secondParty:secondPartyAddr,
                _mediator:mediatorAddr,
                _betId:betId
            });

            (await mediatorTracker.delta()).should.bignumber.equal(new BN(`0`));
            (await firstPartyTracker.delta()).should.bignumber.equal(firstBetValue);
            (await secondPartyTracker.delta()).should.bignumber.equal(secondBetValue.sub(gasUsed));


            const bet = await socialBetsInstance.bets(betId);

            (bet.metadata).should.equal(``);
            (bet.firstParty).should.equal(constants.ZERO_ADDRESS);
            (bet.secondParty).should.equal(constants.ZERO_ADDRESS);
            (bet.mediator).should.equal(constants.ZERO_ADDRESS);
            (bet.firstBetValue).should.bignumber.equal(new BN(`0`));
            (bet.secondBetValue).should.bignumber.equal(new BN(`0`));
            (bet.mediatorFee).should.bignumber.equal(new BN(`0`));
            (bet.secondPartyTimeframe).should.bignumber.equal(new BN(`0`));
            (bet.resultTimeframe).should.bignumber.equal(new BN(`0`));
            (bet.state).should.bignumber.equal(new BN(`0`));
            (bet.firstPartyAnswer).should.bignumber.equal(new BN(`0`));
            (bet.secondPartyAnswer).should.bignumber.equal(new BN(`0`));

        });
    });

    describe(`Cancelling bet test`, async () => {
        beforeEach(async () => {
            socialBetsInstance = await SocialBets.new(
                fee,
                minBetValue,
                defaultMediatorFee,
                defaultMediator
            );
        });
        it(`Bet will be cancelled if mediator set the tie result`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = defaultMediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            await socialBetsInstance.vote(betId, Answers.SecondPartyWins, {
                from: secondPartyAddr
            });

            let mediatorFeeValue = await socialBetsInstance.calculateMediatorFee(betId);

            let mediatorTracker = await balance.tracker(mediatorAddr);
            let firstPartyTracker = await balance.tracker(firstPartyAddr);
            let secondPartyTracker = await balance.tracker(secondPartyAddr);

            let res = await socialBetsInstance.mediate(betId, Answers.Tie, {
                from: mediatorAddr
            });

            const gasUsed = new BN(res.receipt.gasUsed);
            expectEvent(res, "Cancelled", {
                _betId: betId,
                _reason: BetCancellationReasons.MediatorCancelled,
            });
            expectEvent(res,"Completed",{
                _firstParty:firstPartyAddr,
                _secondParty:secondPartyAddr,
                _mediator:mediatorAddr,
                _betId:betId
            });

            (await mediatorTracker.delta()).should.bignumber.equal(mediatorFeeValue.sub(gasUsed));
            let firstMediatorFee = mediatorFeeValue.divn(`2`);
            let secondMediatorFee = mediatorFeeValue.sub(firstMediatorFee);
            (await firstPartyTracker.delta()).should.bignumber.equal(firstBetValue.sub(firstMediatorFee));
            (await secondPartyTracker.delta()).should.bignumber.equal(secondBetValue.sub(secondMediatorFee));

            const bet = await socialBetsInstance.bets(betId);

            (bet.metadata).should.equal(``);
            (bet.firstParty).should.equal(constants.ZERO_ADDRESS);
            (bet.secondParty).should.equal(constants.ZERO_ADDRESS);
            (bet.mediator).should.equal(constants.ZERO_ADDRESS);
            (bet.firstBetValue).should.bignumber.equal(new BN(`0`));
            (bet.secondBetValue).should.bignumber.equal(new BN(`0`));
            (bet.mediatorFee).should.bignumber.equal(new BN(`0`));
            (bet.secondPartyTimeframe).should.bignumber.equal(new BN(`0`));
            (bet.resultTimeframe).should.bignumber.equal(new BN(`0`));
            (bet.state).should.bignumber.equal(new BN(`0`));
            (bet.firstPartyAnswer).should.bignumber.equal(new BN(`0`));
            (bet.secondPartyAnswer).should.bignumber.equal(new BN(`0`));
        });
        it(`Bet will be cancelled if result is tie`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.Tie, {
                from: firstPartyAddr
            });

            let mediatorTracker = await balance.tracker(mediatorAddr);
            let firstPartyTracker = await balance.tracker(firstPartyAddr);
            let secondPartyTracker = await balance.tracker(secondPartyAddr);

            let res = await socialBetsInstance.vote(betId, Answers.Tie, {
                from: secondPartyAddr
            });
            const gasUsed = new BN(res.receipt.gasUsed);

            expectEvent(res, "Cancelled", {
                _betId: betId,
                _reason: BetCancellationReasons.Tie,
            });
            expectEvent(res,"Completed",{
                _firstParty:firstPartyAddr,
                _secondParty:secondPartyAddr,
                _mediator:mediatorAddr,
                _betId:betId
            });

            (await mediatorTracker.delta()).should.bignumber.equal(new BN(`0`));
            (await firstPartyTracker.delta()).should.bignumber.equal(firstBetValue);
            (await secondPartyTracker.delta()).should.bignumber.equal(secondBetValue.sub(gasUsed));


            const bet = await socialBetsInstance.bets(betId);

            (bet.metadata).should.equal(``);
            (bet.firstParty).should.equal(constants.ZERO_ADDRESS);
            (bet.secondParty).should.equal(constants.ZERO_ADDRESS);
            (bet.mediator).should.equal(constants.ZERO_ADDRESS);
            (bet.firstBetValue).should.bignumber.equal(new BN(`0`));
            (bet.secondBetValue).should.bignumber.equal(new BN(`0`));
            (bet.mediatorFee).should.bignumber.equal(new BN(`0`));
            (bet.secondPartyTimeframe).should.bignumber.equal(new BN(`0`));
            (bet.resultTimeframe).should.bignumber.equal(new BN(`0`));
            (bet.state).should.bignumber.equal(new BN(`0`));
            (bet.firstPartyAnswer).should.bignumber.equal(new BN(`0`));
            (bet.secondPartyAnswer).should.bignumber.equal(new BN(`0`));

        });
        it(`Bet will be cancelled if there is second party timeout`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );

            const firstTracker = await balance.tracker(firstPartyAddr);
            const secondTracker = await balance.tracker(secondPartyAddr);
            const thirdTracker = await balance.tracker(thirdParty);
            await time.increaseTo(secondPartyTimeframe.add(duration.days(1)));

            let res = await socialBetsInstance.party2TimeoutHandler(betId, {
                from: thirdParty
            });
            const gasUsed = new BN(res.receipt.gasUsed);

            (await thirdTracker.delta()).should.bignumber.equal(gasUsed.neg());
            (await firstTracker.delta()).should.bignumber.equal(firstBetValue);
            (await secondTracker.delta()).should.bignumber.equal('0');
            expectEvent(res, "Cancelled", {
                _betId: betId,
                _reason: BetCancellationReasons.Party2Timeout
            });
            expectEvent(res,"Completed",{
                _firstParty:firstPartyAddr,
                _secondParty:secondPartyAddr,
                _mediator:mediatorAddr,
                _betId:betId
            });

            const bet = await socialBetsInstance.bets(betId);

            (bet.metadata).should.equal(``);
            (bet.firstParty).should.equal(constants.ZERO_ADDRESS);
            (bet.secondParty).should.equal(constants.ZERO_ADDRESS);
            (bet.mediator).should.equal(constants.ZERO_ADDRESS);
            (bet.firstBetValue).should.bignumber.equal(new BN(`0`));
            (bet.secondBetValue).should.bignumber.equal(new BN(`0`));
            (bet.mediatorFee).should.bignumber.equal(new BN(`0`));
            (bet.secondPartyTimeframe).should.bignumber.equal(new BN(`0`));
            (bet.resultTimeframe).should.bignumber.equal(new BN(`0`));
            (bet.state).should.bignumber.equal(new BN(`0`));
            (bet.firstPartyAnswer).should.bignumber.equal(new BN(`0`));
            (bet.secondPartyAnswer).should.bignumber.equal(new BN(`0`));

        });
        it(`Bet will be cancelled if there is votes timeout`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            const firstTracker = await balance.tracker(firstPartyAddr);
            const secondTracker = await balance.tracker(secondPartyAddr);
            const thirdTracker = await balance.tracker(thirdParty);

            await time.increaseTo(resultTimeframe.add(duration.days(1)));

            let res = await socialBetsInstance.votesTimeoutHandler(betId, {
                from: thirdParty
            });

            expectEvent(res, "Cancelled", {
                _betId: betId,
                _reason: BetCancellationReasons.VotesTimeout
            });
            expectEvent(res,"Completed",{
                _firstParty:firstPartyAddr,
                _secondParty:secondPartyAddr,
                _mediator:mediatorAddr,
                _betId:betId
            });

            const gasUsed = new BN(res.receipt.gasUsed);

            (await thirdTracker.delta()).should.bignumber.equal(gasUsed.neg());
            (await firstTracker.delta()).should.bignumber.equal(firstBetValue);
            (await secondTracker.delta()).should.bignumber.equal(secondBetValue);


            const bet = await socialBetsInstance.bets(betId);

            (bet.metadata).should.equal(``);
            (bet.firstParty).should.equal(constants.ZERO_ADDRESS);
            (bet.secondParty).should.equal(constants.ZERO_ADDRESS);
            (bet.mediator).should.equal(constants.ZERO_ADDRESS);
            (bet.firstBetValue).should.bignumber.equal(new BN(`0`));
            (bet.secondBetValue).should.bignumber.equal(new BN(`0`));
            (bet.mediatorFee).should.bignumber.equal(new BN(`0`));
            (bet.secondPartyTimeframe).should.bignumber.equal(new BN(`0`));
            (bet.resultTimeframe).should.bignumber.equal(new BN(`0`));
            (bet.state).should.bignumber.equal(new BN(`0`));
            (bet.firstPartyAnswer).should.bignumber.equal(new BN(`0`));
            (bet.secondPartyAnswer).should.bignumber.equal(new BN(`0`));

        });
        it(`Bet will be cancelled if there is mediator timeout`, async () => {
            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await socialBetsInstance.createBet(
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr,
                    value: firstBetValue.add(fee)
                }
            );

            const betId = await socialBetsInstance.calculateBetId(
                metadata,
                firstPartyAddr,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe
            );
            await socialBetsInstance.participate(betId, {
                from: secondPartyAddr,
                value: secondBetValue
            });

            await socialBetsInstance.vote(betId, Answers.FirstPartyWins, {
                from: firstPartyAddr
            });

            await socialBetsInstance.vote(betId, Answers.SecondPartyWins, {
                from: secondPartyAddr
            });

            await time.increaseTo(resultTimeframe.add(duration.days(8)));
            const mediatorTracker = await balance.tracker(mediatorAddr);
            const firstTracker = await balance.tracker(firstPartyAddr);
            const secondTracker = await balance.tracker(secondPartyAddr);
            const thirdTracker = await balance.tracker(thirdParty);

            let res = await socialBetsInstance.mediatorTimeoutHandler(betId, {
                from: thirdParty
            });
            expectEvent(res, "Cancelled", {
                _betId: betId,
                _reason: BetCancellationReasons.MediatorTimeout,
            });
            expectEvent(res,"Completed",{
                _firstParty:firstPartyAddr,
                _secondParty:secondPartyAddr,
                _mediator:mediatorAddr,
                _betId:betId
            });

            const gasUsed = new BN(res.receipt.gasUsed);

            (await thirdTracker.delta()).should.bignumber.equal(gasUsed.neg());
            (await firstTracker.delta()).should.bignumber.equal(firstBetValue);
            (await secondTracker.delta()).should.bignumber.equal(secondBetValue);
            (await mediatorTracker.delta()).should.bignumber.equal(`0`);


            const bet = await socialBetsInstance.bets(betId);

            (bet.metadata).should.equal(``);
            (bet.firstParty).should.equal(constants.ZERO_ADDRESS);
            (bet.secondParty).should.equal(constants.ZERO_ADDRESS);
            (bet.mediator).should.equal(constants.ZERO_ADDRESS);
            (bet.firstBetValue).should.bignumber.equal(new BN(`0`));
            (bet.secondBetValue).should.bignumber.equal(new BN(`0`));
            (bet.mediatorFee).should.bignumber.equal(new BN(`0`));
            (bet.secondPartyTimeframe).should.bignumber.equal(new BN(`0`));
            (bet.resultTimeframe).should.bignumber.equal(new BN(`0`));
            (bet.state).should.bignumber.equal(new BN(`0`));
            (bet.firstPartyAnswer).should.bignumber.equal(new BN(`0`));
            (bet.secondPartyAnswer).should.bignumber.equal(new BN(`0`));

        });
    });

    describe(`Check only not contracts`, async () => {
        beforeEach(async () => {
            socialBetsInstance = await SocialBets.new(
                fee,
                minBetValue,
                defaultMediatorFee,
                defaultMediator
            );
        });
        it(`Contract can't call contract prohibited function`, async () => {
            const callContract = await CallSocialBets.new();

            const metadata = "some metadata";
            const firstPartyAddr = firstParty;
            const secondPartyAddr = secondParty;
            const mediatorAddr = mediator;

            const firstBetValue = ether(`0.5`);
            const secondBetValue = ether(`1.5`);
            const mediatorFee = new BN(`400`);
            const secondPartyTimeframe = (await getCurrentTimestamp()).add(duration.days(5));
            const resultTimeframe = (await getCurrentTimestamp()).add(duration.days(10));

            const fee = await socialBetsInstance.calculateFee(firstBetValue, secondBetValue);
            await expectRevert(callContract.callCreate(
                socialBetsInstance.address,
                metadata,
                secondPartyAddr,
                mediatorAddr,
                mediatorFee,
                firstBetValue,
                secondBetValue,
                secondPartyTimeframe,
                resultTimeframe, {
                    from: firstPartyAddr
                }
            ), "Contracts are prohibited");
        });
    })

});