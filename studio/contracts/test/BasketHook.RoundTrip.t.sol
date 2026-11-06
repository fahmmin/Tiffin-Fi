// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {BasketBase, ExitModel} from "./BasketBase.t.sol";
import {BasketHook} from "../BasketHook.sol";

/// @dev USDC -> NVDA buy, then selling every received NVDA back through the router: the trader pays BOTH
/// posted fees (0.30% of each leg's gross output) plus the curve effect of the fee surplus left in the fund.
contract BasketRoundTripTest is BasketBase {
    uint256 internal constant A = 1_000e6;

    // Independent model (plain integer x*y=k + posted fee + 90/10 split), pinned from a hand run.
    uint256 internal constant G1 = 4_980_079_681_274_900_398;
    uint256 internal constant F1 = 14_940_239_043_824_701;
    uint256 internal constant P1 = 1_494_023_904_382_470;
    uint256 internal constant OUT1 = 4_965_139_442_231_075_697;
    uint256 internal constant G2 = 997_001_191;
    uint256 internal constant F2 = 2_991_003;
    uint256 internal constant P2 = 299_100;
    uint256 internal constant OUT2 = 994_010_188;

    function _curve(uint256 rIn, uint256 rOut, uint256 amt) internal pure returns (uint256) {
        return rOut * amt / (rIn + amt);
    }

    uint256[4] internal r0;
    uint256[4] internal r1;
    uint256 internal usdc0;
    uint256 internal nvda0;
    uint256 internal leg1Out;

    function _leg1() internal {
        _align(); // reference == pool price: no reference edge, so no gap fee on leg 1
        assertEq(hook.postedFeeBps(), 30);
        r0 = hook.reserves();
        usdc0 = usdc.balanceOf(bot);
        nvda0 = nvda.balanceOf(bot);

        uint256 g1 = _curve(r0[US], r0[NV], A);
        uint256 f1 = g1 * 30 / 10_000;
        uint256 p1 = f1 * 1000 / 10_000;
        uint256 out1 = g1 - f1;
        assertEq(g1, G1);
        assertEq(f1, F1);
        assertEq(p1, P1);
        assertEq(out1, OUT1);
        assertEq(p1, f1 / 10, "protocol gets 10% of the leg-1 fee");

        BasketHook.Quote memory q1 = hook.quote(address(usdc), address(nvda), A);
        assertEq(q1.edgeUsd, 0);
        assertEq(q1.gapFee, 0);
        assertEq(q1.feeOut, f1);
        assertEq(q1.protocolFee, p1);

        vm.expectEmit(true, true, false, true, address(hook));
        emit BasketHook.Swap(address(usdc), address(nvda), A, out1, f1, p1, 0, 0);
        uint256 got1 = _swap(bot, US, NV, A);
        assertEq(got1, out1, "leg 1 == x*y=k - 0.30%");
        assertEq(nvda.balanceOf(bot) - nvda0, out1);
        leg1Out = out1;

        r1 = hook.reserves();
        assertEq(r1[US], r0[US] + A);
        assertEq(r1[NV], r0[NV] - out1 - p1, "NVDA reserve fell by payout + protocol share");
        assertEq(r1[NV], r0[NV] - g1 + (f1 - p1), "fund kept the other 90% of the fee");
        assertEq(hook.protocolFees()[NV], p1);
    }

    function _leg2() internal {
        _align(); // reference == the new pool price again: still no gap fee
        assertEq(hook.postedFeeBps(), 30);
        uint256 out1 = leg1Out;
        uint256 g2 = _curve(r1[NV], r1[US], out1);
        uint256 f2 = g2 * 30 / 10_000;
        uint256 p2 = f2 * 1000 / 10_000;
        uint256 out2 = g2 - f2;
        assertEq(g2, G2);
        assertEq(f2, F2);
        assertEq(p2, P2);
        assertEq(out2, OUT2);
        assertEq(p2, f2 / 10, "protocol gets 10% of the leg-2 fee");

        BasketHook.Quote memory q2 = hook.quote(address(nvda), address(usdc), out1);
        assertEq(q2.edgeUsd, 0, "no reference edge on the way back");
        assertEq(q2.gapFee, 0);
        assertEq(q2.feeOut, f2);

        vm.expectEmit(true, true, false, true, address(hook));
        emit BasketHook.Swap(address(nvda), address(usdc), out1, out2, f2, p2, 0, 0);
        assertEq(_swap(bot, NV, US, out1), out2, "leg 2 == x*y=k - 0.30%");

        uint256[4] memory r2 = hook.reserves();
        assertEq(r2[US], r1[US] - out2 - p2);
        assertEq(r2[NV], r1[NV] + out1);
    }

    function test_RoundTrip_BothPostedFeesPlusImpact_ExactModel() public {
        _leg1();
        _leg2();

        assertEq(nvda.balanceOf(bot), nvda0, "all received NVDA sold");
        assertEq(usdc.balanceOf(bot), usdc0 - A + OUT2, "exact final USDC");
        assertEq(usdc.balanceOf(bot), usdc0 - 5_989_812, "net cost 5.989812 USDC on 1,000");

        uint256[4] memory pf = hook.protocolFees();
        assertEq(pf[NV], P1, "protocolFees[NVDA] == 10% of leg-1 fee");
        assertEq(pf[US], P2, "protocolFees[USDC] == 10% of leg-2 fee");
        assertEq(pf[NV], F1 / 10);
        assertEq(pf[US], F2 / 10);
        assertEq(pf[AA] + pf[MS], 0);
        assertEq(hook.swapCount(), 2);
        assertEq(hook.gapCapturedUsd(), 0, "no gap fee on either leg");
        _assertClaimsMatch();
    }

    function test_RoundTrip_LossEqualsFee1PlusFee2PlusImpact() public {
        _align();
        uint256[4] memory q0 = hook.reserves();
        uint256 start = usdc.balanceOf(bot);
        uint256 out1 = _swap(bot, US, NV, A);
        uint256[4] memory q1 = hook.reserves();
        _align();
        uint256 out2 = _swap(bot, NV, US, out1);
        uint256 loss = start - usdc.balanceOf(bot);
        assertEq(loss, A - out2);

        // A fee-free x*y=k round trip is lossless (to 1 unit): price impact is symmetric.
        uint256 g1 = _curve(q0[US], q0[NV], A);
        uint256 pureBack = _curve(q0[NV] - g1, q0[US] + A, g1);
        assertGe(pureBack, A - 1);
        assertLe(pureBack, A);

        // On the post-leg-1 curve: loss = impact + leg-1 fee value + leg-2 fee.
        uint256 impact = A - _curve(q1[NV], q1[US], g1); // selling the *gross* amount back
        uint256 fee1Value = _curve(q1[NV], q1[US], g1) - _curve(q1[NV], q1[US], out1); // USDC lost by selling fee1 fewer NVDA
        uint256 fee2 = (_curve(q1[NV], q1[US], out1)) * 30 / 10_000;
        assertEq(loss, impact + fee1Value + fee2, "loss == fee1 + fee2 + impact");

        // Each fee is ~0.30% of the trade's value (3 USDC on 1,000); impact is the 90% fee surplus
        // that stays in the fund and shifts the curve (+10,757 units here), far below either fee.
        assertEq(fee1Value, 2_988_052);
        assertEq(fee2, F2);
        assertEq(impact, 10_757);
        assertApproxEqRel(fee1Value, A * 30 / 10_000, 0.01e18, "leg-1 fee value ~0.30%");
        assertApproxEqRel(fee2, A * 30 / 10_000, 0.01e18, "leg-2 fee ~0.30%");
        assertLt(impact, 20_000, "pure curve impact is tiny");
        assertGt(loss, fee1Value + fee2, "loss exceeds the two fees alone");
        assertGt(loss, A * 59 / 10_000);
        assertLt(loss, A * 61 / 10_000);
    }

    struct JS {
        uint256 amt;
        uint256 nav0;
        uint256 shares;
        uint256 gross;
        uint256 exitFee;
        uint256 outNv;
    }

    function test_JoinSingleUsdc_ExitSingleNvda_PaysBothThreeQuarterFeesAndNeverProfits() public {
        JS memory t;
        t.amt = 100e6;
        (t.nav0,) = hook.navUsd();
        uint256 supply0 = hook.totalSupply();

        uint256 expShares = _expJoinSingleShares(US, t.amt);
        vm.prank(lp);
        t.shares = hook.joinSingle(address(usdc), t.amt, 0);
        assertEq(t.shares, expShares);
        assertEq(t.amt * 30 * 3 / 40_000, 225_000, "0.225 USDC withheld from the share calculation");

        t.gross = ExitModel.gross(hook, clock, NV, t.shares);
        t.exitFee = (t.gross * 30 * 3 + 39_999) / 40_000;
        uint256 expNet = _expExitNet(NV, t.shares);
        assertEq(expNet, t.gross - t.exitFee);
        uint256 nv0 = nvda.balanceOf(lp);
        vm.prank(lp);
        t.outNv = hook.exitSingle(address(nvda), t.shares, expNet);
        assertEq(t.outNv, expNet);
        assertEq(nvda.balanceOf(lp) - nv0, t.outNv);
        assertEq(hook.balanceOf(lp), 0);
        assertEq(hook.totalSupply(), supply0, "shares fully burned");
        _checkJoinExitLoss(t);
    }

    function _checkJoinExitLoss(JS memory t) internal view {
        uint256 valIn = t.amt * 1e12; // $100.00
        uint256 valOut = t.outNv * 200; // NVDA @ $200 reference, 18 decimals
        uint256 loss = valIn - valOut;
        uint256 feesUsd = (t.amt * 30 * 3 / 40_000) * 1e12 + t.exitFee * 200;
        assertLt(valOut, valIn, "never profits");
        assertGe(loss, feesUsd, "pays both three-quarter fees (0.225% each)");
        // Remainder is only the (tiny) Balancer convexity on a 0.04% entry: well under 0.05% of the trade.
        assertLe(loss - feesUsd, valIn * 5 / 10_000);
        assertGe(loss, valIn * 45 / 10_000);
        assertLe(loss, valIn * 50 / 10_000);

        // The holder's loss is the fund's gain: NAV rose by exactly that (supply unchanged).
        (uint256 nav1,) = hook.navUsd();
        assertApproxEqAbs(nav1 - t.nav0, loss, 2);
        _assertClaimsMatch();
    }

    function _expJoinSingleShares(uint256 idx, uint256 amt) internal view returns (uint256 shares) {
        uint256 b = hook.reserves()[idx];
        uint256 supply = hook.totalSupply();
        uint256 effIn = amt - amt * hook.postedFeeBps() * 3 / 40_000;
        uint256 x = (b + effIn) * 1e18 / b;
        uint256 root4 = Math.sqrt(Math.sqrt(x * 1e18) * 1e18);
        shares = supply * (root4 - 1e18) / 1e18;
        (uint256 nav,) = hook.navUsd();
        uint256 cap = _val(idx, amt, _px()[idx]) * supply / nav;
        if (cap < shares) shares = cap;
    }
}
