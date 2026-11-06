// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BasketBase, ExitModel} from "./BasketBase.t.sol";
import {BasketHook} from "../BasketHook.sol";
import {BasketRouter} from "../BasketRouter.sol";
import {MarketClock} from "../MarketClock.sol";

contract BasketFuzzTest is BasketBase {
    /// forge-config: default.fuzz.runs = 256
    function testFuzz_Swap_QuoteEqualsRealised_ProductNeverDecreases_ClaimsBalance(
        uint8 a,
        uint8 b,
        uint256 amtSeed,
        uint256 refSeed,
        bool open,
        bool stale
    ) public {
        uint256 i = a % 4;
        uint256 o = (i + 1 + (b % 3)) % 4;
        // Perturb the NVDA reference (+/-10%) so both posted-fee and gap-fee branches are exercised.
        _push(bound(refSeed, 180e18, 220e18), 250e18, 500e18, open);
        if (stale) vm.warp(T0 + 6 hours + 1);

        uint256[4] memory r0 = hook.reserves();
        uint256[4] memory pf0 = hook.protocolFees();
        uint256 amt = bound(amtSeed, i == US ? 1e6 : 1e12, r0[i] / 10);

        BasketHook.Quote memory q = hook.quote(assets[i], assets[o], amt);
        assertEq(q.fresh, !stale);
        if (stale) assertEq(q.gapFee, 0, "no gap fee while stale");
        uint256 out = _swap(bot, i, o, amt);

        assertEq(out, q.amountOut, "quote == realised");
        uint256[4] memory r1 = hook.reserves();
        uint256[4] memory pf1 = hook.protocolFees();
        assertGe(r1[i] * r1[o], r0[i] * r0[o], "x*y never decreases");
        assertEq(r1[i], r0[i] + amt);
        assertEq(r1[o], r0[o] - out - q.protocolFee);
        assertEq(pf1[o], pf0[o] + q.protocolFee);
        for (uint256 j; j < 4; ++j) {
            if (j != i && j != o) {
                assertEq(r1[j], r0[j], "untouched reserve");
                assertEq(pf1[j], pf0[j]);
            }
        }
        assertLe(q.feeOut * 10, out + q.feeOut, "fee never above 10% of gross");
        if (q.gapFee > 0 && q.protocolFee == 0) assertEq(pf1[o], pf0[o], "gap levy is all fund");
        _assertClaimsMatch();
    }

    function testFuzz_JoinThenExit_NeverReturnsMoreThanDeposited(uint256 frac, uint256 skewSeed) public {
        _swap(bot, US, NV, bound(skewSeed, 1e6, 20_000e6));
        frac = bound(frac, 1e14, 1e18); // up to 100% of the current fund
        uint256[4] memory bal = hook.reserves();
        uint256[4] memory max;
        for (uint256 i; i < 4; ++i) max[i] = bal[i] * frac / 1e18 + 1;
        uint256[4] memory before = _lpBalances();
        vm.startPrank(lp);
        uint256 shares = hook.join(max, 0);
        uint256[4] memory zero;
        hook.exit(shares, zero);
        vm.stopPrank();
        uint256[4] memory afterB = _lpBalances();
        uint256[4] memory end = hook.reserves();
        for (uint256 i; i < 4; ++i) {
            assertLe(afterB[i], before[i], "exit never returns more than the join took");
            assertLe(before[i] - afterB[i], 2 + bal[i] / 1e18, "loss bounded by rounding");
            assertGe(end[i], bal[i], "fund never loses to a join/exit");
        }
        assertEq(hook.balanceOf(lp), 0);
        _assertClaimsMatch();
    }

    function testFuzz_JoinSingleThenExitSingle_CannotProfit(uint8 idx, uint256 amtSeed, uint256 refSeed) public {
        uint256 i = idx % 4;
        _push(bound(refSeed, 170e18, 230e18), 250e18, 500e18, true);
        uint256 reserve = hook.reserves()[i];
        uint256 amt = bound(amtSeed, reserve / 100_000, reserve * 3000 / 10_000);
        vm.startPrank(lp);
        uint256 shares = hook.joinSingle(assets[i], amt, 0);
        uint256 out = hook.exitSingle(assets[i], shares, 0);
        vm.stopPrank();
        assertLe(out, amt, "value out at reference <= value in");
        _assertClaimsMatch();
    }

    function testFuzz_ExitSingle_NetIsGrossMinusCeilThreeQuarterFee_FeeStaysInFund(
        uint8 idx,
        uint256 shareSeed,
        uint256 refSeed,
        bool open
    ) public {
        uint256 i = idx % 4;
        _push(bound(refSeed, 170e18, 230e18), 250e18, 500e18, open);
        // <= 8% of supply keeps the Balancer payout under the 30% single-asset cap.
        uint256 shares = bound(shareSeed, 1e15, 80_000e18);
        assertEq(hook.postedFeeBps(), open ? 30 : 60);
        uint256 g = ExitModel.gross(hook, clock, i, shares);
        assertLe(g, ExitModel.cap(hook, i), "gross within pre-fee cap");
        uint256 fee = (g * hook.postedFeeBps() * 3 + 39_999) / 40_000;
        _fuzzExit(i, shares, g, fee);
    }

    function _fuzzExit(uint256 i, uint256 shares, uint256 g, uint256 fee) internal {
        uint256 net = g - fee;
        uint256[4] memory r0 = hook.reserves();
        uint256[4] memory pf0 = hook.protocolFees();
        uint256 held0 = IERC20(assets[i]).balanceOf(address(this));

        assertEq(hook.exitSingle(assets[i], shares, net), net); // minOut == net is accepted
        assertEq(IERC20(assets[i]).balanceOf(address(this)) - held0, net);
        uint256[4] memory r1 = hook.reserves();
        uint256[4] memory pf1 = hook.protocolFees();
        for (uint256 j; j < 4; ++j) {
            assertEq(r1[j], j == i ? r0[j] - net : r0[j], "reserve falls by net payout only");
            assertEq(pf1[j], pf0[j], "no protocol cut on exitSingle");
        }
        assertEq(r1[i], r0[i] - g + fee, "fee stays in fund");
        _assertClaimsMatch();
    }

    function _lpBalances() internal view returns (uint256[4] memory b) {
        for (uint256 i; i < 4; ++i) b[i] = IERC20(assets[i]).balanceOf(lp);
    }
}

/// @dev Bounded action surface for the invariant fuzzer. Not a Test, so only these functions are targeted.
contract BasketHandler {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    BasketHook public hook;
    BasketRouter public router;
    MarketClock public clock;
    address public clockOwner;
    address public treasury;
    address[4] internal assets;
    uint256 public swaps;
    uint256 public joins;
    uint256 public exits;
    uint256 public exitSingleOk;
    uint256 public exitAmountMismatch;
    uint256 public exitReserveMismatch;
    uint256 public exitUnexpectedRevert;
    uint256 public exitUnexpectedSuccess;

    constructor(BasketHook h, BasketRouter r, MarketClock c, address owner_, address treasury_, address[4] memory a) {
        hook = h;
        router = r;
        clock = c;
        clockOwner = owner_;
        treasury = treasury_;
        assets = a;
    }

    function _bound(uint256 x, uint256 lo, uint256 hi) internal pure returns (uint256) {
        if (hi <= lo) return lo;
        return lo + (x % (hi - lo + 1));
    }

    function swapAny(uint8 a, uint8 b, uint256 amtSeed) external {
        uint256 i = a % 4;
        uint256 o = (i + 1 + (b % 3)) % 4;
        uint256 reserve = hook.reserves()[i];
        uint256 amt = _bound(amtSeed, i == 3 ? 1e6 : 1e12, reserve / 10);
        PoolKey memory k = hook.poolKey(assets[i], assets[o]);
        try router.swapExactInput(k, assets[i] < assets[o], amt, 0, address(this)) {
            ++swaps;
        } catch {}
    }

    function join(uint256 frac) external {
        frac = _bound(frac, 1e14, 5e17);
        uint256[4] memory bal = hook.reserves();
        uint256[4] memory max;
        for (uint256 i; i < 4; ++i) max[i] = bal[i] * frac / 1e18 + 1;
        try hook.join(max, 0) {
            ++joins;
        } catch {}
    }

    function exit(uint256 frac) external {
        uint256 bal = hook.balanceOf(address(this));
        if (bal == 0) return;
        uint256 shares = _bound(frac, 1, bal);
        uint256[4] memory zero;
        try hook.exit(shares, zero) {
            ++exits;
        } catch {}
    }

    function joinSingle(uint8 idx, uint256 amtSeed) external {
        uint256 i = idx % 4;
        uint256 reserve = hook.reserves()[i];
        uint256 amt = _bound(amtSeed, reserve / 100_000, reserve * 3 / 10);
        try hook.joinSingle(assets[i], amt, 0) {} catch {}
    }

    function exitSingle(uint8 idx, uint256 frac) external {
        uint256 bal = hook.balanceOf(address(this));
        if (bal == 0) return;
        uint256 i = idx % 4;
        uint256 shares = _bound(frac, 1, bal);
        (, bool fresh) = hook.navUsd();
        if (!fresh) {
            try hook.exitSingle(assets[i], shares, 0) {
                ++exitUnexpectedSuccess;
            } catch {}
            return;
        }
        // Independent expectation: gross (cap checks apply to it), then net = gross - ceil(gross*bps*3/40000).
        uint256 g = ExitModel.gross(hook, clock, i, shares);
        uint256 net = g - ExitModel.fee(g, hook.postedFeeBps());
        bool shouldSucceed = g <= ExitModel.cap(hook, i) && net > 0;
        uint256 reserve0 = hook.reserves()[i];
        uint256 held0 = IERC20(assets[i]).balanceOf(address(this));
        uint256[4] memory pf0 = hook.protocolFees();
        try hook.exitSingle(assets[i], shares, 0) returns (uint256 out) {
            ++exitSingleOk;
            if (!shouldSucceed) ++exitUnexpectedSuccess;
            if (out != net) ++exitAmountMismatch;
            if (IERC20(assets[i]).balanceOf(address(this)) - held0 != net) ++exitAmountMismatch;
            // The fee stays in the fund: the reserve falls by the net payout only; no protocol cut.
            if (hook.reserves()[i] != reserve0 - net) ++exitReserveMismatch;
            uint256[4] memory pf1 = hook.protocolFees();
            for (uint256 j; j < 4; ++j) if (pf1[j] != pf0[j]) ++exitReserveMismatch;
        } catch {
            if (shouldSucceed) ++exitUnexpectedRevert;
        }
    }

    function pushReport(uint256 p0, uint256 p1, uint256 p2, bool open) external {
        uint256[] memory p = new uint256[](3);
        p[0] = _bound(p0, 150e18, 260e18);
        p[1] = _bound(p1, 200e18, 300e18);
        p[2] = _bound(p2, 400e18, 600e18);
        vm.prank(clockOwner);
        clock.pushReport(abi.encode(p, open));
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + _bound(secs, 0, 8 hours));
    }

    function collect() external {
        vm.prank(clockOwner);
        hook.collectProtocolFees(treasury);
    }
}

contract BasketInvariantTest is BasketBase {
    BasketHandler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new BasketHandler(hook, router, clock, address(this), treasury, assets);
        _fundActor(address(handler), 1_000_000e18, 100_000_000e6);
        bytes4[] memory sels = new bytes4[](8);
        sels[0] = BasketHandler.swapAny.selector;
        sels[1] = BasketHandler.join.selector;
        sels[2] = BasketHandler.exit.selector;
        sels[3] = BasketHandler.joinSingle.selector;
        sels[4] = BasketHandler.exitSingle.selector;
        sels[5] = BasketHandler.pushReport.selector;
        sels[6] = BasketHandler.warp.selector;
        sels[7] = BasketHandler.collect.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: sels}));
        targetContract(address(handler));
    }

    /// @dev Guards against a vacuous invariant run: the handler's try/catch actions really succeed.
    function test_HandlerActionsActuallyExecute() public {
        handler.swapAny(3, 0, 123_456_789);
        handler.swapAny(0, 1, 987_654_321);
        assertEq(handler.swaps(), 2, "swaps succeed");
        handler.join(1e17);
        assertEq(handler.joins(), 1, "join succeeds");
        handler.exit(1e18);
        assertEq(handler.exits(), 1, "exit succeeds");
        uint256 supply = hook.totalSupply();
        handler.joinSingle(0, 5e17);
        assertGt(hook.totalSupply(), supply, "joinSingle succeeds");
        handler.exitSingle(0, 1e20);
        assertEq(handler.exitSingleOk(), 1, "exitSingle succeeds");
        assertEq(handler.exitAmountMismatch() + handler.exitReserveMismatch(), 0, "net payout matches model");
        handler.pushReport(1e18, 2e18, 3e18, false);
        handler.warp(1 hours);
        handler.collect();
        assertEq(hook.protocolFees()[NV] + hook.protocolFees()[US], 0);
        _assertClaimsMatch();
    }

    /// forge-config: default.invariant.runs = 48
    /// forge-config: default.invariant.depth = 40
    function invariant_HookClaimsEqualReservesPlusProtocolFees() public view {
        _assertClaimsMatch();
    }

    /// @dev exitSingle always pays the model's net amount, the fee stays in the fund, and it never
    /// reverts/succeeds against the model's cap and freshness predictions.
    /// forge-config: default.invariant.runs = 48
    /// forge-config: default.invariant.depth = 40
    function invariant_ExitSingleMatchesNetModel() public view {
        assertEq(handler.exitAmountMismatch(), 0, "net payout");
        assertEq(handler.exitReserveMismatch(), 0, "fee stays in reserve, no protocol cut");
        assertEq(handler.exitUnexpectedRevert(), 0, "unexpected revert");
        assertEq(handler.exitUnexpectedSuccess(), 0, "unexpected success");
    }

    /// forge-config: default.invariant.runs = 48
    /// forge-config: default.invariant.depth = 40
    function invariant_ShareSupplyEqualsHolderBalances() public view {
        assertEq(hook.totalSupply(), hook.balanceOf(address(this)) + hook.balanceOf(address(handler)));
    }

    /// forge-config: default.invariant.runs = 48
    /// forge-config: default.invariant.depth = 40
    function invariant_ReservesStayNonZero() public view {
        uint256[4] memory r = hook.reserves();
        for (uint256 i; i < 4; ++i) assertGt(r[i], 0);
    }
}
