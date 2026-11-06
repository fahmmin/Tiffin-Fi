// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console2} from "forge-std/console2.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {BasketBase} from "./BasketBase.t.sol";
import {BasketHook} from "../BasketHook.sol";

/// @dev Opening-gap behaviour: reference NVDA $210 while the pool still implies $200.
contract BasketGapTest is BasketBase {
    uint256 internal constant REF = 210e18;

    function setUp() public override {
        super.setUp();
        _push(REF, 250e18, 500e18, true);
    }

    /// USDC in that moves the NVDA pool price from $200 to $210 (no fees): y*(sqrt(1.05)-1).
    function _closeGapAmount() internal pure returns (uint256) {
        uint256 s = Math.sqrt(1.05e36); // sqrt(1.05) in 1e18
        return Math.mulDiv(250_000e6, s - 1e18, 1e18);
    }

    function _botProfitUsd(uint256 amt) internal returns (int256 profit) {
        uint256 id = vm.snapshotState();
        uint256 out = _swap(bot, US, NV, amt);
        profit = int256(out * 210) - int256(amt * 1e12);
        vm.revertToState(id);
    }

    function test_Gap_FundKeeps80PctBotKeeps20Pct_NoProtocolCut() public {
        uint256 amt = 1_000e6;
        uint256[4] memory r0 = hook.reserves();
        uint256 gross = Math.mulDiv(r0[NV], amt, r0[US] + amt);
        uint256 edge = gross * 210 - amt * 1e12; // value at $210 of what the pool gives up minus USDC paid
        uint256 expGapFee = Math.mulDiv(Math.mulDiv(edge, 8000, 10_000), 1e18, REF);
        assertGt(edge, 0);
        assertGt(expGapFee, Math.mulDiv(gross, 30, 10_000), "gap fee beats posted fee");
        assertLt(expGapFee, Math.mulDiv(gross, 1000, 10_000), "below 10% cap");

        BasketHook.Quote memory q = hook.quote(address(usdc), address(nvda), amt);
        assertEq(q.edgeUsd, edge, "quote edge");
        assertEq(q.gapFee, expGapFee, "quote gapFee");
        assertEq(q.feeOut, expGapFee);
        assertEq(q.protocolFee, 0);
        assertEq(q.amountOut, gross - expGapFee);

        uint256[4] memory pf0 = hook.protocolFees();
        uint256 gap0 = hook.gapCapturedUsd();
        uint256 fees0 = hook.totalFeesUsd();
        uint256 out = _swap(bot, US, NV, amt);

        assertEq(out, gross - expGapFee);
        uint256 feeUsd = expGapFee * 210;
        assertEq(q.feeUsd, feeUsd);
        // 80 / 20 split of the bot's edge (floor of fee tokens costs < 210 wei USD18).
        assertApproxEqAbs(feeUsd, edge * 80 / 100, 210, "fund keeps 80%");
        int256 botNet = int256(out * 210) - int256(amt * 1e12);
        assertEq(uint256(botNet) + feeUsd, edge, "edge fully split");
        assertApproxEqAbs(uint256(botNet), edge * 20 / 100, 210, "bot keeps 20%");

        uint256[4] memory pf1 = hook.protocolFees();
        for (uint256 i; i < 4; ++i) assertEq(pf1[i], pf0[i], "protocol gets nothing");
        assertEq(hook.protocolEarnedUsd(), 0);
        assertEq(hook.gapCapturedUsd(), gap0 + feeUsd, "gapCapturedUsd += feeUsd");
        assertEq(hook.totalFeesUsd(), fees0 + feeUsd);
        assertEq(hook.reserves()[NV], r0[NV] - out, "fee stays in the fund's reserve");
        _assertClaimsMatch();

        console2.log("gap case: USDC in (6dp)      ", amt);
        console2.log("gap case: edge USD18         ", edge);
        console2.log("gap case: fund share USD18   ", feeUsd);
        console2.log("gap case: bot share USD18    ", uint256(botNet));
    }

    function test_Gap_ClosingWholeGapBeatsHalfAndOneAndAHalf() public {
        uint256 one = _closeGapAmount();
        assertApproxEqAbs(one, 6_173_769_000, 1e6, "~6173.769 USDC");
        int256 half = _botProfitUsd(one / 2);
        int256 full = _botProfitUsd(one);
        int256 oneHalf = _botProfitUsd(one * 3 / 2);
        console2.log("bot net profit 0.5x (USD18)", uint256(half));
        console2.log("bot net profit 1.0x (USD18)", uint256(full));
        console2.log("bot net profit 1.5x (USD18)", uint256(oneHalf));
        assertGt(half, 0);
        assertGt(oneHalf, 0);
        assertGt(full, half, "1x beats 0.5x");
        assertGt(full, oneHalf, "1x beats 1.5x");
    }

    function test_Gap_CloseWholeGap_FundGets80PctOfEdge() public {
        uint256 one = _closeGapAmount();
        BasketHook.Quote memory q = hook.quote(address(usdc), address(nvda), one);
        uint256 out = _swap(bot, US, NV, one);
        int256 botNet = int256(out * 210) - int256(one * 1e12);
        assertEq(uint256(botNet) + q.feeUsd, q.edgeUsd);
        assertApproxEqAbs(q.feeUsd, q.edgeUsd * 80 / 100, 210);
        assertEq(q.protocolFee, 0);
        // Pool price lands just under the reference ($210) because the levy stays in the NVDA reserve.
        uint256 p = hook.poolPriceUsd(address(nvda));
        assertLt(p, 210e18);
        assertGt(p, 205e18);
    }

    function test_Gap_TenSlices_FundStillGetsAbout80PctOfSummedEdge() public {
        uint256 one = _closeGapAmount();
        uint256 slice = one / 10;
        uint256 sumEdge;
        uint256 sumFee;
        uint256 sumOut;
        for (uint256 k; k < 10; ++k) {
            BasketHook.Quote memory q = hook.quote(address(usdc), address(nvda), slice);
            uint256 out = _swap(bot, US, NV, slice);
            assertEq(out, q.amountOut);
            sumEdge += q.edgeUsd;
            sumFee += q.feeUsd;
            sumOut += out;
        }
        uint256 botNet = sumOut * 210 - slice * 10 * 1e12;
        console2.log("10 slices: summed edge", sumEdge);
        console2.log("10 slices: fund fees  ", sumFee);
        console2.log("10 slices: bot net    ", botNet);
        assertEq(botNet + sumFee, sumEdge, "edge fully split");
        // Measured: the posted 0.30% fee overtakes the 80% levy on the last slices (edge per slice shrinks
        // as the pool price converges), so the fund collects slightly MORE than 80% (~80.28%), not
        // exactly 80% to 0.01%. Assert the guarantee that does hold: fund >= 80% and within 0.5% of it.
        assertGe(sumFee + 1e3, sumEdge * 80 / 100, "fund never gets less than 80% of summed edge");
        assertApproxEqRel(sumFee, sumEdge * 80 / 100, 5e15, "fund within 0.5% of 80%");
        assertApproxEqRel(botNet, sumEdge * 20 / 100, 2e16, "bot ~20%");
        console2.log("10 slices: fund share bps of edge", sumFee * 10_000 / sumEdge);
    }

    function test_Gap_CapAtTenPercentOfGross() public {
        // A huge reference gap is capped at 10% of gross output (and still no protocol cut).
        _push(400e18, 250e18, 500e18, true);
        uint256 amt = 1_000e6;
        BasketHook.Quote memory q = hook.quote(address(usdc), address(nvda), amt);
        uint256 gross = q.amountOut + q.feeOut;
        assertEq(q.gapFee, Math.mulDiv(gross, 1000, 10_000));
        assertEq(q.feeOut, q.gapFee);
        assertEq(q.protocolFee, 0);
        assertEq(_swap(bot, US, NV, amt), q.amountOut);
    }

    function test_Gap_SellingIntoPoolWhenReferenceIsAboveGivesNoEdge() public {
        // Selling NVDA (pool undervalues it vs. $210 ref) is the wrong side: no edge, posted fee.
        uint256 amt = 5e18;
        BasketHook.Quote memory q = hook.quote(address(nvda), address(usdc), amt);
        assertEq(q.edgeUsd, 0);
        assertEq(q.gapFee, 0);
        assertEq(q.feeOut, Math.mulDiv(q.amountOut + q.feeOut, 30, 10_000));
        assertEq(q.protocolFee, q.feeOut / 10);
    }
}
