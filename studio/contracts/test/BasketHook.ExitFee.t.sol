// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {BasketBase, ExitModel} from "./BasketBase.t.sol";
import {BasketHook} from "../BasketHook.sol";

/// @dev exitSingle charges 3/4 of the live posted fee out of the payout (ceil), after the cap checks.
/// The fee stays in the fund: no protocol cut, no counters.
contract BasketExitFeeTest is BasketBase {
    uint256 internal constant SHARES = 5_000e18;

    // AAPL, 5,000 shares of a 1,000,000-share fund: gross = 19.850499375 AAPL (no USD-cap binding).
    uint256 internal constant GROSS_AAPL = 19_850_499_375_000_000_000;
    uint256 internal constant FEE_OPEN = 44_663_623_593_750_000; // gross * 30 * 3 / 40000
    uint256 internal constant NET_OPEN = 19_805_835_751_406_250_000;
    uint256 internal constant FEE_CLOSED = 89_327_247_187_500_000; // gross * 60 * 3 / 40000
    uint256 internal constant NET_CLOSED = 19_761_172_127_812_500_000;

    struct Pre {
        uint256[4] r;
        uint256[4] pf;
        uint256 claim;
        uint256 held;
        uint256 supply;
        uint256 gross;
        uint256 net;
    }

    function _exitAndCheck(uint256 idx, uint256 shares, uint256 bps) internal returns (uint256 out, uint256 fee) {
        Pre memory p;
        p.gross = ExitModel.gross(hook, clock, idx, shares);
        fee = ExitModel.fee(p.gross, bps);
        p.net = p.gross - fee;
        assertEq(hook.postedFeeBps(), bps);
        assertGt(fee, 0);
        p.r = hook.reserves();
        p.pf = hook.protocolFees();
        p.claim = _claim(idx);
        p.held = _bal(idx);
        p.supply = hook.totalSupply();

        uint256[4] memory amounts;
        amounts[idx] = p.net;
        vm.expectEmit(true, false, false, true, address(hook));
        emit BasketHook.Exited(address(this), shares, amounts);
        out = hook.exitSingle(assets[idx], shares, p.net);

        assertEq(out, p.net, "payout == gross - ceil(gross*bps*3/40000)");
        assertEq(_bal(idx) - p.held, p.net, "holder received the net amount");
        assertEq(hook.totalSupply(), p.supply - shares);
        _checkAfter(p, idx, fee);
    }

    function _checkAfter(Pre memory p, uint256 idx, uint256 fee) internal view {
        uint256[4] memory r1 = hook.reserves();
        uint256[4] memory pf1 = hook.protocolFees();
        for (uint256 j; j < 4; ++j) {
            assertEq(r1[j], j == idx ? p.r[j] - p.net : p.r[j], "reserve decreases by the net payout only");
            assertEq(pf1[j], p.pf[j], "no protocol cut");
        }
        assertEq(r1[idx], p.r[idx] - p.gross + fee, "the fee stays in the reserve");
        assertEq(p.claim - _claim(idx), p.net, "manager claim fell by the net payout only");
        _assertClaimsMatch(); // reserves() + protocolFees() == manager claims
    }

    function _bal(uint256 idx) internal view returns (uint256) {
        return idx == NV ? nvda.balanceOf(address(this))
            : idx == AA ? aapl.balanceOf(address(this))
            : idx == MS ? msft.balanceOf(address(this)) : usdc.balanceOf(address(this));
    }

    // ------------------------------------------------ exact numbers

    function test_ExitSingle_OpenMarket_PaysGrossMinusCeilThreeQuarterOf30Bps() public {
        assertEq(ExitModel.gross(hook, clock, AA, SHARES), GROSS_AAPL);
        assertEq(ExitModel.fee(GROSS_AAPL, 30), FEE_OPEN);
        (uint256 out, uint256 fee) = _exitAndCheck(AA, SHARES, 30);
        assertEq(fee, FEE_OPEN, "fee = 0.225% of gross");
        assertEq(out, NET_OPEN);
        assertEq(GROSS_AAPL - out, FEE_OPEN);
    }

    function test_ExitSingle_ClosedMarket_PaysGrossMinusCeilThreeQuarterOf60Bps() public {
        _push(200e18, 250e18, 500e18, false);
        assertEq(ExitModel.gross(hook, clock, AA, SHARES), GROSS_AAPL);
        (uint256 out, uint256 fee) = _exitAndCheck(AA, SHARES, 60);
        assertEq(fee, FEE_CLOSED, "fee = 0.45% of gross");
        assertEq(out, NET_CLOSED);
        assertEq(FEE_CLOSED, 2 * FEE_OPEN);
    }

    function test_ExitSingle_AllAssets_BothMarkets_ExactNetAndFeeStaysInFund() public {
        uint256 roundedUp;
        for (uint256 m; m < 2; ++m) {
            bool open = m == 0;
            _push(200e18, 250e18, 500e18, open);
            uint256 bps = open ? 30 : 60;
            for (uint256 i; i < 4; ++i) {
                uint256 shares = 1_234e18 + i * 777e18;
                uint256 g = ExitModel.gross(hook, clock, i, shares);
                if ((g * bps * 3) % 40_000 != 0) ++roundedUp;
                assertEq(ExitModel.fee(g, bps), Math.mulDiv(g, bps * 3, 40_000, Math.Rounding.Ceil));
                _exitAndCheck(i, shares, bps);
            }
        }
        assertGt(roundedUp, 0, "fee rounding up was exercised");
    }

    function test_ExitSingle_FeeDoesNotTouchCountersOrProtocolFees() public {
        _swap(bot, US, NV, 1_000e6); // creates a nonzero protocol fee + counters to compare against
        _align();
        uint256 sc = hook.swapCount();
        uint256 tf = hook.totalFeesUsd();
        uint256 pe = hook.protocolEarnedUsd();
        uint256 gc = hook.gapCapturedUsd();
        uint256[4] memory pf = hook.protocolFees();
        assertGt(pf[NV], 0);
        _exitAndCheck(AA, SHARES, 30);
        assertEq(hook.swapCount(), sc);
        assertEq(hook.totalFeesUsd(), tf);
        assertEq(hook.protocolEarnedUsd(), pe);
        assertEq(hook.gapCapturedUsd(), gc);
        assertEq(hook.protocolFees()[NV], pf[NV]);
    }

    function test_ExitSingle_UsesLiveCustomFees() public {
        hook.setFees(10, 20, 300, 500);
        uint256 g = ExitModel.gross(hook, clock, AA, SHARES);
        (uint256 out, uint256 fee) = _exitAndCheck(AA, SHARES, 10);
        assertEq(fee, (g * 30 + 39_999) / 40_000);
        assertEq(out, g - fee);
        _push(200e18, 250e18, 500e18, false);
        g = ExitModel.gross(hook, clock, AA, SHARES);
        (out, fee) = _exitAndCheck(AA, SHARES, 20);
        assertEq(out, g - (g * 60 + 39_999) / 40_000);
    }

    // ----------------------------------- minOut / caps / zero are checked at the right place

    function test_ExitSingle_MinOutIsCheckedAgainstNetPayout() public {
        uint256 net = NET_OPEN;
        vm.expectRevert(BasketHook.Slippage.selector);
        hook.exitSingle(address(aapl), SHARES, GROSS_AAPL); // gross would pass, net does not
        vm.expectRevert(BasketHook.Slippage.selector);
        hook.exitSingle(address(aapl), SHARES, net + 1);
        assertEq(hook.exitSingle(address(aapl), SHARES, net), net);
    }

    function test_ExitSingle_CapIsAppliedToPreFeeAmount() public {
        for (uint256 m; m < 2; ++m) {
            bool open = m == 0;
            uint256 bps = open ? 30 : 60;
            _push(200e18, 250e18, 500e18, open);
            uint256[2] memory idxs = [US, NV];
            for (uint256 k; k < 2; ++k) {
                uint256 idx = idxs[k];
                uint256 s = _minSharesOverCap(idx);
                uint256 cap = ExitModel.cap(hook, idx);
                uint256 g = ExitModel.gross(hook, clock, idx, s);
                uint256 net = g - ExitModel.fee(g, bps);
                assertGt(g, cap, "pre-fee amount is over the cap");
                assertLe(net, cap, "yet the net payout alone would fit");

                uint256 snap = vm.snapshotState();
                vm.expectRevert(BasketHook.ExceedsSingleAssetCap.selector);
                hook.exitSingle(assets[idx], s, 0);
                // one share-wei less: gross is at/below the cap and the call pays the net amount
                uint256 g1 = ExitModel.gross(hook, clock, idx, s - 1);
                assertLe(g1, cap);
                assertEq(hook.exitSingle(assets[idx], s - 1, 0), g1 - ExitModel.fee(g1, bps));
                vm.revertToState(snap);
            }
        }
    }

    function test_ExitSingle_ZeroPayoutAndStaleStillRevert() public {
        vm.expectRevert(BasketHook.InvalidAmount.selector);
        hook.exitSingle(address(usdc), 1, 0); // 1 share-wei pays 0 USDC units
        vm.warp(T0 + 6 hours + 1);
        vm.expectRevert(BasketHook.StalePrices.selector);
        hook.exitSingle(address(aapl), SHARES, 0);
    }

    function _minSharesOverCap(uint256 idx) internal view returns (uint256 lo) {
        uint256 cap = ExitModel.cap(hook, idx);
        uint256 hi = hook.totalSupply() / 10;
        assertGt(ExitModel.gross(hook, clock, idx, hi), cap);
        lo = 1;
        while (lo < hi) {
            uint256 mid = (lo + hi) / 2;
            if (ExitModel.gross(hook, clock, idx, mid) > cap) hi = mid;
            else lo = mid + 1;
        }
    }
}
