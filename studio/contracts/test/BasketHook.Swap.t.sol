// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BasketBase} from "./BasketBase.t.sol";
import {BasketHook} from "../BasketHook.sol";

contract BasketSwapTest is BasketBase {
    struct Exp {
        uint256 gross;
        uint256 fee;
        uint256 prot;
        uint256 out;
    }

    function _expPosted(uint256 bIn, uint256 bOut, uint256 amt, uint256 bps) internal pure returns (Exp memory e) {
        e.gross = Math.mulDiv(bOut, amt, bIn + amt);
        e.fee = Math.mulDiv(e.gross, bps, 10_000);
        e.prot = Math.mulDiv(e.fee, 1000, 10_000);
        e.out = e.gross - e.fee;
    }

    // ------------------------------------------------------------ 1. seed

    function test_FirstShareIsWorthOneDollar() public view {
        assertEq(hook.totalSupply(), 1_000_000e18);
        assertEq(hook.balanceOf(address(this)), 1_000_000e18);
        (uint256 nav, bool fresh) = hook.navUsd();
        assertEq(nav, 1_000_000e18);
        assertTrue(fresh);
        assertEq(hook.sharePriceUsd(), 1e18);
        uint256[4] memory r = hook.reserves();
        assertEq(r[0], 1250e18);
        assertEq(r[1], 1000e18);
        assertEq(r[2], 500e18);
        assertEq(r[3], 250_000e6);
        _assertClaimsMatch();
    }

    function test_PoolPricesMatchReferenceAfterSeed() public view {
        assertEq(hook.poolPriceUsd(address(nvda)), 200e18);
        assertEq(hook.poolPriceUsd(address(aapl)), 250e18);
        assertEq(hook.poolPriceUsd(address(msft)), 500e18);
        assertEq(hook.poolPriceUsd(address(usdc)), 1e18);
        assertEq(hook.postedFeeBps(), 30);
    }

    // ------------------------------------------- 2. USDC -> NVDA posted fee

    function test_UsdcToNvda_EqualsConstantProductMinusPostedFee() public {
        uint256 amt = 1_000e6;
        uint256[4] memory r0 = hook.reserves();
        Exp memory e = _expPosted(r0[US], r0[NV], amt, 30);
        // Sanity-pin the closed-form numbers.
        assertEq(e.gross, Math.mulDiv(1250e18, 1_000e6, 251_000e6));
        assertEq(e.fee, e.gross * 30 / 10_000);
        assertEq(e.prot, e.fee / 10);

        BasketHook.Quote memory q = hook.quote(address(usdc), address(nvda), amt);
        assertEq(q.amountOut, e.out, "quote.amountOut");
        assertEq(q.feeOut, e.fee, "quote.feeOut");
        assertEq(q.protocolFee, e.prot, "quote.protocolFee");
        assertEq(q.edgeUsd, 0);
        assertEq(q.gapFee, 0);
        assertTrue(q.fresh);
        assertEq(q.feeUsd, Math.mulDiv(e.fee, 200e18, 1e18));

        uint256 botNvda0 = nvda.balanceOf(bot);
        uint256 botUsdc0 = usdc.balanceOf(bot);
        PoolKey memory k = hook.poolKey(address(usdc), address(nvda));
        bool zfo = address(usdc) < address(nvda);
        vm.expectEmit(true, true, false, true, address(hook));
        emit BasketHook.Swap(address(usdc), address(nvda), amt, e.out, e.fee, e.prot, 0, 0);
        vm.prank(bot);
        uint256 out = router.swapExactInput(k, zfo, amt, 0, bot);

        assertEq(out, e.out, "realised == x*y=k - fee");
        assertEq(out, q.amountOut, "realised == quote");
        assertEq(nvda.balanceOf(bot) - botNvda0, out);
        assertEq(botUsdc0 - usdc.balanceOf(bot), amt);

        uint256[4] memory pf = hook.protocolFees();
        assertEq(pf[NV], e.prot);
        assertEq(pf[AA] + pf[MS] + pf[US], 0);
        uint256[4] memory r1 = hook.reserves();
        assertEq(r1[US], r0[US] + amt);
        assertEq(r1[NV], r0[NV] - out - e.prot, "reserve fell by out + protocol fee");
        assertEq(r1[AA], r0[AA]);
        assertEq(r1[MS], r0[MS]);

        assertEq(hook.swapCount(), 1);
        assertEq(hook.totalFeesUsd(), Math.mulDiv(e.fee, 200e18, 1e18));
        assertEq(hook.protocolEarnedUsd(), Math.mulDiv(e.prot, 200e18, 1e18));
        assertEq(hook.gapCapturedUsd(), 0);
        _assertClaimsMatch();
    }

    function test_NvdaToUsdc_EqualsConstantProductMinusPostedFee() public {
        uint256 amt = 5e18;
        uint256[4] memory r0 = hook.reserves();
        Exp memory e = _expPosted(r0[NV], r0[US], amt, 30);
        BasketHook.Quote memory q = hook.quote(address(nvda), address(usdc), amt);
        assertEq(q.edgeUsd, 0);
        uint256 out = _swap(bot, NV, US, amt);
        assertEq(out, e.out);
        assertEq(out, q.amountOut);
        assertEq(hook.protocolFees()[US], e.prot);
        assertEq(hook.reserves()[US], r0[US] - out - e.prot);
        assertEq(hook.reserves()[NV], r0[NV] + amt);
        assertEq(hook.totalFeesUsd(), Math.mulDiv(e.fee, 1e18, 1e6));
    }

    // ------------------------------------------------ 3. stock -> stock hop

    function test_StockToStock_IsOneHopAndTouchesOnlyInAndOut() public {
        uint256 amt = 10e18;
        uint256[4] memory r0 = hook.reserves();
        Exp memory e = _expPosted(r0[NV], r0[AA], amt, 30);
        BasketHook.Quote memory q = hook.quote(address(nvda), address(aapl), amt);
        assertEq(q.amountOut, e.out);
        assertEq(q.edgeUsd, 0);

        vm.recordLogs();
        uint256 out = _swap(bot, NV, AA, amt);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 hookSwapEvents;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(hook) && logs[i].topics[0] == BasketHook.Swap.selector) ++hookSwapEvents;
        }
        assertEq(hookSwapEvents, 1, "exactly one hook swap");
        assertEq(hook.swapCount(), 1);

        assertEq(out, e.out);
        assertEq(out, q.amountOut);
        uint256[4] memory r1 = hook.reserves();
        assertEq(r1[NV], r0[NV] + amt);
        assertEq(r1[AA], r0[AA] - out - e.prot);
        assertEq(r1[MS], r0[MS], "MSFT untouched");
        assertEq(r1[US], r0[US], "USDC untouched");
        uint256[4] memory pf = hook.protocolFees();
        assertEq(pf[AA], e.prot);
        assertEq(pf[NV] + pf[MS] + pf[US], 0);
        assertEq(hook.totalFeesUsd(), Math.mulDiv(e.fee, 250e18, 1e18));
        _assertClaimsMatch();
    }

    // ---------------------------------------------- 4. closed / stale fees

    function test_ClosedMarket_FeeIs60Bps() public {
        _push(200e18, 250e18, 500e18, false);
        assertEq(hook.postedFeeBps(), 60);
        uint256 amt = 1_000e6;
        uint256[4] memory r0 = hook.reserves();
        Exp memory e = _expPosted(r0[US], r0[NV], amt, 60);
        BasketHook.Quote memory q = hook.quote(address(usdc), address(nvda), amt);
        assertTrue(q.fresh);
        assertEq(q.gapFee, 0);
        assertEq(q.feeOut, e.fee);
        uint256 out = _swap(bot, US, NV, amt);
        assertEq(out, e.out);
        assertEq(out, q.amountOut);
        assertEq(hook.protocolFees()[NV], e.prot);
        assertEq(e.fee, e.gross * 60 / 10_000);
    }

    function test_FreshnessBoundaryIsInclusiveAtMaxPriceAge() public {
        vm.warp(T0 + 6 hours);
        (, bool fresh) = hook.navUsd();
        assertTrue(fresh, "exactly maxPriceAge old is still fresh");
        assertEq(hook.postedFeeBps(), 30);
        vm.warp(T0 + 6 hours + 1);
        (, fresh) = hook.navUsd();
        assertFalse(fresh);
        assertEq(hook.postedFeeBps(), 200);
    }

    function test_StaleReference_FeeIs200Bps_AndNoGapFeeEvenWithPriceMismatch() public {
        // Reference 210 vs pool 200 would be a gap trade if fresh.
        _push(210e18, 250e18, 500e18, true);
        vm.warp(T0 + 6 hours + 1);
        assertEq(hook.postedFeeBps(), 200);

        uint256 amt = 1_000e6;
        uint256[4] memory r0 = hook.reserves();
        Exp memory e = _expPosted(r0[US], r0[NV], amt, 200);
        BasketHook.Quote memory q = hook.quote(address(usdc), address(nvda), amt);
        assertFalse(q.fresh);
        assertEq(q.gapFee, 0, "no gap fee while stale");
        assertEq(q.edgeUsd, 0);
        assertEq(q.feeOut, e.fee);
        assertEq(q.feeOut, e.gross * 2 / 100, "feeOut == 2% of gross");
        assertEq(q.protocolFee, e.prot);

        uint256 out = _swap(bot, US, NV, amt);
        assertEq(out, e.out);
        assertEq(hook.protocolFees()[NV], e.prot);
        assertEq(hook.gapCapturedUsd(), 0);
        assertEq(hook.totalFeesUsd(), Math.mulDiv(e.fee, 210e18, 1e18));
    }

    function test_StaleReference_ExitStillWorksButSinglesRevert() public {
        vm.warp(T0 + 7 hours);
        uint256[4] memory zero;
        uint256[4] memory amounts = hook.exit(1_000e18, zero);
        assertEq(amounts[US], 250e6);
        vm.expectRevert(BasketHook.StalePrices.selector);
        hook.joinSingle(address(usdc), 1e6, 0);
        vm.expectRevert(BasketHook.StalePrices.selector);
        hook.exitSingle(address(usdc), 1e18, 0);
    }

    function test_CustomFees_AreUsedBySwaps() public {
        hook.setFees(10, 20, 300, 500);
        uint256 amt = 1_000e6;
        uint256[4] memory r0 = hook.reserves();
        uint256 gross = Math.mulDiv(r0[NV], amt, r0[US] + amt);
        uint256 fee = Math.mulDiv(gross, 10, 10_000);
        uint256 out = _swap(bot, US, NV, amt);
        assertEq(out, gross - fee);
        assertEq(hook.protocolFees()[NV], Math.mulDiv(fee, 500, 10_000));
    }

    // ----------------------------------------------- 7. buy then sell USDC

    function test_RoundTrip_Small_CostsOnlyFeesAndImpact() public {
        uint256 amt = 100e6;
        uint256 usdc0 = usdc.balanceOf(bot);
        Mdl memory m1 = _model(US, NV, amt, 30);
        assertEq(m1.edge, 0);
        uint256 nvOut = _swap(bot, US, NV, amt);
        assertEq(nvOut, m1.out);

        Mdl memory m2 = _model(NV, US, nvOut, 30);
        // Posted fee binds on the way back for a small trade (gap levy is below 0.3%).
        assertEq(m2.gapFee < Math.mulDiv(m2.gross, 30, 10_000), true);
        uint256 back = _swap(bot, NV, US, nvOut);
        assertEq(back, m2.out, "exact x*y=k expectation");

        uint256 loss = usdc0 - usdc.balanceOf(bot) ;
        assertEq(loss, amt - back);
        assertLt(usdc.balanceOf(bot), usdc0, "round trip loses");
        assertGe(loss, amt * 55 / 10_000, "at least ~2 x 0.30% fees");
        assertLe(loss, amt * 70 / 10_000, "at most fees + tiny price impact");
        _assertClaimsMatch();
    }

    function test_RoundTrip_Large_ExactModelAndGapLevyOnReturnLeg() public {
        uint256 amt = 10_000e6;
        uint256 usdc0 = usdc.balanceOf(bot);
        Mdl memory m1 = _model(US, NV, amt, 30);
        uint256 nvOut = _swap(bot, US, NV, amt);
        assertEq(nvOut, m1.out);

        // After a 4% USDC inflow the pool prices NVDA well above the $200 reference, so the
        // return leg is an edge trade against the reference and the 80% levy replaces the posted fee.
        Mdl memory m2 = _model(NV, US, nvOut, 30);
        assertGt(m2.edge, 0);
        assertGt(m2.gapFee, Math.mulDiv(m2.gross, 30, 10_000));
        BasketHook.Quote memory q2 = hook.quote(address(nvda), address(usdc), nvOut);
        assertEq(q2.edgeUsd, m2.edge);
        assertEq(q2.gapFee, m2.gapFee);
        assertEq(q2.protocolFee, 0);
        uint256 back = _swap(bot, NV, US, nvOut);
        assertEq(back, m2.out);
        assertEq(back, q2.amountOut);

        assertLt(back, amt);
        assertEq(usdc0 - usdc.balanceOf(bot), amt - back);
        _assertClaimsMatch();
    }
}
