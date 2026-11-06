// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {BasketBase} from "./BasketBase.t.sol";
import {BasketHook} from "../BasketHook.sol";

contract BasketLiquidityTest is BasketBase {
    function _bals(address who) internal view returns (uint256[4] memory b) {
        for (uint256 i; i < 4; ++i) b[i] = IERC20(assets[i]).balanceOf(who);
    }

    function _skew() internal {
        _swap(bot, US, NV, 7_777e6);
        _swap(bot, NV, AA, 3.3e18);
        _swap(bot, AA, US, 12.5e18);
    }

    // -------------------------------------------------- 6. join / exit

    function test_JoinThenExit_ReturnsSameSliceWithinWeiInFundsFavour() public {
        _skew();
        uint256[4] memory max = [uint256(100e18), 80e18, 40e18, 20_000e6];
        uint256[4] memory bal = hook.reserves();
        uint256 supply = hook.totalSupply();
        uint256 expShares = type(uint256).max;
        for (uint256 i; i < 4; ++i) expShares = Math.min(expShares, Math.mulDiv(max[i], supply, bal[i]));
        uint256[4] memory expIn;
        for (uint256 i; i < 4; ++i) expIn[i] = Math.mulDiv(expShares, bal[i], supply, Math.Rounding.Ceil);

        uint256[4] memory lp0 = _bals(lp);
        vm.expectEmit(true, false, false, true, address(hook));
        emit BasketHook.Joined(lp, expShares, expIn);
        vm.prank(lp);
        uint256 shares = hook.join(max, 0);

        assertEq(shares, expShares, "shares minted");
        assertEq(hook.balanceOf(lp), expShares);
        assertEq(hook.totalSupply(), supply + expShares);
        uint256[4] memory lp1 = _bals(lp);
        uint256[4] memory mid = hook.reserves();
        for (uint256 i; i < 4; ++i) {
            assertEq(lp0[i] - lp1[i], expIn[i], "paid ceil amount");
            assertLe(expIn[i], max[i]);
            assertEq(mid[i], bal[i] + expIn[i]);
        }
        _assertClaimsMatch();

        uint256[4] memory expOut;
        for (uint256 i; i < 4; ++i) expOut[i] = Math.mulDiv(mid[i], expShares, supply + expShares);
        uint256[4] memory zero;
        vm.expectEmit(true, false, false, true, address(hook));
        emit BasketHook.Exited(lp, expShares, expOut);
        vm.prank(lp);
        uint256[4] memory outAmts = hook.exit(expShares, zero);

        assertEq(hook.balanceOf(lp), 0, "all shares burned");
        assertEq(hook.totalSupply(), supply, "supply restored");
        uint256[4] memory lp2 = _bals(lp);
        uint256[4] memory end = hook.reserves();
        for (uint256 i; i < 4; ++i) {
            assertEq(outAmts[i], expOut[i]);
            assertEq(lp2[i] - lp1[i], outAmts[i]);
            assertLe(outAmts[i], expIn[i], "never returns more than put in");
            assertLe(expIn[i] - outAmts[i], 2, "within a couple of wei");
            assertGe(end[i], bal[i], "fund never loses");
            assertLe(end[i] - bal[i], 2);
        }
        _assertClaimsMatch();
    }

    function test_Join_SlippageAndZeroReverts() public {
        uint256[4] memory max = [uint256(12.5e18), 10e18, 5e18, 2_500e6]; // 1% of fund
        vm.prank(lp);
        vm.expectRevert(BasketHook.Slippage.selector);
        hook.join(max, 10_000e18 + 1);
        vm.prank(lp);
        uint256 s = hook.join(max, 10_000e18);
        assertEq(s, 10_000e18);

        uint256[4] memory none;
        vm.prank(lp);
        vm.expectRevert(BasketHook.InvalidAmount.selector);
        hook.join(none, 0);
    }

    function test_Exit_SlippageAndInvalidAmountReverts() public {
        uint256[4] memory huge = [uint256(1e30), 1e30, 1e30, 1e30];
        vm.expectRevert(BasketHook.Slippage.selector);
        hook.exit(1_000e18, huge);
        uint256[4] memory zero;
        vm.expectRevert(BasketHook.InvalidAmount.selector);
        hook.exit(0, zero);
        vm.prank(lp); // lp has no shares
        vm.expectRevert(BasketHook.InvalidAmount.selector);
        hook.exit(1e18, zero);
    }

    // ------------------------------------------------- single asset

    function _expJoinSingle(uint256 idx, uint256 amt) internal view returns (uint256 shares) {
        uint256 b = hook.reserves()[idx];
        uint256 supply = hook.totalSupply();
        uint256 effIn = amt - Math.mulDiv(amt, hook.postedFeeBps() * 3, 40_000);
        uint256 x = Math.mulDiv(b + effIn, 1e18, b);
        uint256 root4 = Math.sqrt(Math.sqrt(x * 1e18) * 1e18);
        shares = Math.mulDiv(supply, root4 - 1e18, 1e18);
        (uint256 nav,) = hook.navUsd();
        shares = Math.min(shares, Math.mulDiv(_val(idx, amt, _px()[idx]), supply, nav));
    }

    /// @dev Net payout: gross - ceil(gross * postedBps * 3 / 40000).
    function _expExitSingle(uint256 idx, uint256 shares) internal view returns (uint256 out) {
        out = _expExitNet(idx, shares);
    }

    function test_JoinSingle_ExactFormula() public {
        uint256 amt = 10e18;
        uint256 exp = _expJoinSingle(NV, amt);
        assertGt(exp, 0);
        uint256 supply0 = hook.totalSupply();
        uint256 bal0 = nvda.balanceOf(lp);
        vm.prank(lp);
        uint256 shares = hook.joinSingle(address(nvda), amt, 0);
        assertEq(shares, exp, "closed-form shares");
        assertEq(hook.balanceOf(lp), shares);
        assertEq(hook.totalSupply(), supply0 + shares);
        assertEq(bal0 - nvda.balanceOf(lp), amt);
        assertEq(hook.reserves()[NV], 1250e18 + amt);
        // $2,000 in; shares are worth < $2,000 at ~$1 NAV (zap fee + curve slippage).
        assertLt(shares, 2_000e18);
        assertGt(shares, 1_985e18);
        _assertClaimsMatch();
    }

    function test_JoinSingle_CapAndSlippageAndZeroReverts() public {
        uint256 cap = 1250e18 * 3000 / 10_000; // 375e18
        vm.prank(lp);
        hook.joinSingle(address(nvda), cap, 0);

        // reserve grew; new cap is 30% of the new reserve, so 1e18 above a fresh cap must revert
        uint256 newCap = hook.reserves()[AA] * 3000 / 10_000;
        vm.prank(lp);
        vm.expectRevert(BasketHook.ExceedsSingleAssetCap.selector);
        hook.joinSingle(address(aapl), newCap + 1, 0);
        vm.prank(lp);
        vm.expectRevert(BasketHook.InvalidAmount.selector);
        hook.joinSingle(address(aapl), 0, 0);
        vm.prank(lp);
        vm.expectRevert(BasketHook.Slippage.selector);
        hook.joinSingle(address(aapl), 1e18, type(uint256).max);
    }

    function test_JoinSingle_JustAboveCapReverts() public {
        vm.prank(lp);
        vm.expectRevert(BasketHook.ExceedsSingleAssetCap.selector);
        hook.joinSingle(address(nvda), 375e18 + 1, 0);
    }

    function test_ExitSingle_ExactFormulaAndCapRevert() public {
        uint256 shares = 5_000e18;
        uint256 exp = _expExitSingle(AA, shares);
        assertGt(exp, 0);
        uint256 bal0 = aapl.balanceOf(address(this));
        vm.expectEmit(true, false, false, true, address(hook));
        emit BasketHook.Exited(address(this), shares, [uint256(0), exp, 0, 0]);
        uint256 out = hook.exitSingle(address(aapl), shares, 0);
        assertEq(out, exp, "closed-form net out");
        assertEq(out, 19805835751406250000, "pinned net: 19.850499375 gross - 0.04466362359375 fee");
        assertEq(aapl.balanceOf(address(this)) - bal0, out);
        assertEq(hook.totalSupply(), 1_000_000e18 - shares);
        assertEq(hook.reserves()[AA], 1000e18 - out);
        // $5,000 of shares: at most $5,000 of AAPL (20 tokens @ $250), strictly less due to curve.
        assertLt(out, 20e18);
        _assertClaimsMatch();

        vm.expectRevert(BasketHook.ExceedsSingleAssetCap.selector);
        hook.exitSingle(address(usdc), 500_000e18, 0);
        vm.expectRevert(BasketHook.Slippage.selector);
        hook.exitSingle(address(aapl), 1_000e18, type(uint256).max);
        vm.expectRevert(BasketHook.InvalidAmount.selector);
        hook.exitSingle(address(aapl), 0, 0);
    }

    function test_JoinSingleThenExitSingle_CannotProfit_AllAssets() public {
        uint256[4] memory amts = [uint256(10e18), 8e18, 4e18, 2_000e6];
        for (uint256 i; i < 4; ++i) {
            uint256 before = IERC20(assets[i]).balanceOf(lp);
            vm.startPrank(lp);
            uint256 shares = hook.joinSingle(assets[i], amts[i], 0);
            uint256 expOut = _expExitSingle(i, shares);
            uint256 out = hook.exitSingle(assets[i], shares, 0);
            vm.stopPrank();
            assertEq(out, expOut, "net exit payout matches model");
            // Same asset, same reference price: value out <= value in  <=>  out <= in.
            assertLe(out, amts[i], "no profit round-tripping a single asset");
            assertEq(before - IERC20(assets[i]).balanceOf(lp), amts[i] - out);
            assertEq(hook.balanceOf(lp), 0);
        }
        _assertClaimsMatch();
    }

    function test_JoinSingleThenExitSingle_CannotProfit_WhenReferenceMovesAgainstPool() public {
        _push(230e18, 250e18, 500e18, true); // NVDA reference above pool price
        vm.startPrank(lp);
        uint256 shares = hook.joinSingle(address(usdc), 20_000e6, 0);
        uint256 outNv = hook.exitSingle(address(nvda), shares, 0);
        vm.stopPrank();
        // Entered with $20,000 USDC, left with NVDA valued at the reference: must not exceed $20,000.
        assertLe(outNv * 230, 20_000e18, "value out at reference <= value in");
    }

    // ----------------------------------------------------------- views

    function test_SharePrice_TracksNavOverSupply() public {
        _push(220e18, 250e18, 500e18, true);
        (uint256 nav,) = hook.navUsd();
        assertEq(nav, 1250e18 * 220 + 250_000e18 + 250_000e18 + 250_000e18);
        assertEq(hook.sharePriceUsd(), Math.mulDiv(nav, 1e18, 1_000_000e18));
    }
}

/// @dev Fixture without the owner seed.
contract BasketSeedTest is BasketBase {
    function setUp() public override {
        _deployAll();
        nvda.mint(address(this), 2000e18);
        aapl.mint(address(this), 2000e18);
        msft.mint(address(this), 2000e18);
        usdc.mint(address(this), 500_000e6);
        for (uint256 i; i < 4; ++i) IERC20(assets[i]).approve(address(hook), type(uint256).max);
    }

    function test_Seed_NonOwnerCannotSeed() public {
        vm.prank(lp);
        vm.expectRevert(BasketHook.SeedOwnerOnly.selector);
        hook.join([uint256(1250e18), 1000e18, 500e18, 250_000e6], 0);
    }

    function test_Seed_UnbalancedReverts() public {
        vm.expectRevert(BasketHook.UnbalancedSeed.selector);
        hook.join([uint256(1300e18), 1000e18, 500e18, 250_000e6], 0); // NVDA slice $260k vs $250k
        vm.expectRevert(BasketHook.UnbalancedSeed.selector);
        hook.join([uint256(1250e18), 1000e18, 500e18, 100_000e6], 0); // USDC slice too small vs stocks
        vm.expectRevert(BasketHook.UnbalancedSeed.selector);
        hook.join([uint256(1250e18), 1000e18, 400e18, 250_000e6], 0);
    }

    function test_Seed_ZeroAmountAndStaleRevert() public {
        vm.expectRevert(BasketHook.InvalidAmount.selector);
        hook.join([uint256(0), 1000e18, 500e18, 250_000e6], 0);
        vm.expectRevert(BasketHook.InvalidAmount.selector);
        hook.join([uint256(1250e18), 1000e18, 500e18, 0], 0);
        vm.warp(T0 + 6 hours + 1);
        vm.expectRevert(BasketHook.StalePrices.selector);
        hook.join([uint256(1250e18), 1000e18, 500e18, 250_000e6], 0);
    }

    function test_Seed_SlippageMinSharesReverts() public {
        vm.expectRevert(BasketHook.Slippage.selector);
        hook.join([uint256(1250e18), 1000e18, 500e18, 250_000e6], 1_000_000e18 + 1);
    }

    function test_Seed_WithinOnePercentSucceedsAndMintsFourSharesPerUsdcUnit() public {
        uint256[4] memory amts = [uint256(1252e18), 1000e18, 500e18, 250_000e6]; // NVDA +0.16%
        vm.expectEmit(true, false, false, true, address(hook));
        emit BasketHook.Joined(address(this), 1_000_000e18, amts);
        uint256 shares = hook.join(amts, 1_000_000e18);
        assertEq(shares, 250_000e6 * 4 * 1e12);
        assertEq(hook.totalSupply(), 1_000_000e18);
        assertEq(hook.reserves()[NV], 1252e18);
        _assertClaimsMatch();
    }

    function test_BeforeSeed_SharePriceIsOneAndSwapsRevertEmptyReserve() public {
        assertEq(hook.sharePriceUsd(), 1e18);
        vm.expectRevert(BasketHook.EmptyReserve.selector);
        hook.quote(address(usdc), address(nvda), 1e6);
    }
}
