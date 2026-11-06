// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {FixedPointMathLib} from "solmate/src/utils/FixedPointMathLib.sol";
import {BasketHook} from "../src/BasketHook.sol";
import {BasketRouter} from "../src/BasketRouter.sol";
import {MarketClock} from "../src/MarketClock.sol";
import {MockStock} from "../src/MockStock.sol";

contract BasketHookTest is Deployers {
    uint8 constant NVDA = 0;
    uint8 constant AAPL = 1;
    uint8 constant MSFT = 2;
    uint8 constant USDC = 3;

    BasketHook hook;
    BasketRouter router;
    MarketClock clock;
    MockStock nvda;
    MockStock aapl;
    MockStock msft;
    MockERC20 usdc;

    address alice = makeAddr("alice");
    address bot = makeAddr("bot");
    address forwarder = makeAddr("forwarder");

    function setUp() public {
        deployFreshManagerAndRouters();
        nvda = new MockStock("Test Nvidia", "tNVDA", address(this));
        aapl = new MockStock("Test Apple", "tAAPL", address(this));
        msft = new MockStock("Test Microsoft", "tMSFT", address(this));
        usdc = new MockERC20("USD Coin", "USDC", 6);

        address[] memory stocks = new address[](3);
        (stocks[0], stocks[1], stocks[2]) = (address(nvda), address(aapl), address(msft));
        address[] memory forwarders = new address[](1);
        forwarders[0] = forwarder;
        clock = new MarketClock(address(this), stocks, forwarders);
        _report(200e18, 250e18, 500e18, true);

        Currency[3] memory stockCurrencies =
            [Currency.wrap(address(nvda)), Currency.wrap(address(aapl)), Currency.wrap(address(msft))];
        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG
                | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG
        );
        address hookAddress = address(flags ^ (0x4444 << 144));
        deployCodeTo(
            "BasketHook.sol:BasketHook",
            abi.encode(manager, clock, stockCurrencies, Currency.wrap(address(usdc)), address(this)),
            hookAddress
        );
        hook = BasketHook(hookAddress);
        router = new BasketRouter(manager);

        for (uint8 a; a < 4; ++a) {
            for (uint8 b = a + 1; b < 4; ++b) {
                manager.initialize(hook.poolKey(a, b), SQRT_PRICE_1_1);
            }
        }

        // $250,000 in each asset: 1,250 NVDA at $200, 1,000 AAPL at $250, 500 MSFT at $500, 250,000 USDC.
        _fund(address(this), 1_250e18, 1_000e18, 500e18, 250_000e6);
        hook.join([uint256(1_250e18), 1_000e18, 500e18, 250_000e6], 0);
    }

    // ------------------------------------------------------------------
    // Swaps and the posted fee
    // ------------------------------------------------------------------

    function test_seed_firstShareIsWorthOneDollar() public view {
        assertEq(hook.totalSupply(), 1_000_000e18);
        assertEq(hook.sharePriceUsd(), 1e18);
    }

    function test_swap_isConstantProductMinusPostedFee() public {
        _fund(alice, 0, 0, 0, 10_000e6);
        uint256[4] memory before = hook.reserves();
        uint256 out = _swap(alice, USDC, NVDA, 10_000e6);

        uint256 gross = before[NVDA] * 10_000e6 / (before[USDC] + 10_000e6);
        uint256 fee = FixedPointMathLib.mulDivUp(gross, 30, 10_000);
        assertEq(out, gross - fee, "x*y=k minus 0.30%");
        assertEq(nvda.balanceOf(alice), out);

        uint256[4] memory protocol = hook.protocolFees();
        assertEq(protocol[NVDA], fee / 10, "protocol gets 10% of the posted fee");
        uint256[4] memory after_ = hook.reserves();
        assertEq(after_[USDC], before[USDC] + 10_000e6);
        assertEq(after_[NVDA], before[NVDA] - out - protocol[NVDA], "90% of the fee stays in the fund");
    }

    function test_stockToStock_isOneHop() public {
        _fund(alice, 10e18, 0, 0, 0);
        uint256[4] memory r = hook.reserves();
        uint256 out = _swap(alice, NVDA, AAPL, 10e18);
        // $2,000 of NVDA buys about 8 AAPL at $250: one pool, one 0.30% fee, priced on the shared reserve.
        uint256 gross = r[AAPL] * 10e18 / (r[NVDA] + 10e18);
        assertEq(out, gross - FixedPointMathLib.mulDivUp(gross, 30, 10_000));
        assertApproxEqRel(out, 8e18, 0.015e18);
        assertEq(aapl.balanceOf(alice), out);
    }

    function test_closedMarket_chargesTheClosedFee() public {
        _report(200e18, 250e18, 500e18, false);
        BasketHook.Quote memory q = hook.quote(USDC, AAPL, 1_000e6);
        uint256[4] memory r = hook.reserves();
        uint256 gross = r[AAPL] * 1_000e6 / (r[USDC] + 1_000e6);
        assertFalse(q.gapFee);
        assertEq(q.feeOut, FixedPointMathLib.mulDivUp(gross, 60, 10_000));
    }

    function test_stalePrices_chargeTheMaxFeeAndSkipTheGapFee() public {
        vm.warp(block.timestamp + 7 hours);
        BasketHook.Quote memory q = hook.quote(USDC, NVDA, 1_000e6);
        uint256[4] memory r = hook.reserves();
        uint256 gross = r[NVDA] * 1_000e6 / (r[USDC] + 1_000e6);
        assertFalse(q.fresh);
        assertFalse(q.gapFee);
        assertEq(q.feeOut, FixedPointMathLib.mulDivUp(gross, 200, 10_000));
    }

    // ------------------------------------------------------------------
    // Monday's gap
    // ------------------------------------------------------------------

    function test_mondayGap_fundKeepsEightyPercentOfTheEdge() public {
        // Friday close $200. Monday opens 5% higher, but the pool still prices NVDA at $200.
        _report(210e18, 250e18, 500e18, true);
        uint256 usdcIn = _usdcToReach(210e18);
        BasketHook.Quote memory q = hook.quote(USDC, NVDA, usdcIn);
        assertTrue(q.gapFee, "gap fee applies");
        assertApproxEqAbs(q.edgeUsd, 152e18, 1e18, "edge of a 5% gap on the $500k NVDA/USDC pair");

        _fund(bot, 0, 0, 0, usdcIn);
        uint256[4] memory protocolBefore = hook.protocolFees();
        _swap(bot, USDC, NVDA, usdcIn);

        assertApproxEqRel(hook.gapCapturedUsd(), q.edgeUsd * 8 / 10, 0.001e18, "fund keeps 80%");
        uint256 botValue = nvda.balanceOf(bot) * 210; // USD, 18 decimals
        assertApproxEqRel(botValue - usdcIn * 1e12, q.edgeUsd * 2 / 10, 0.005e18, "bot keeps 20%");
        uint256[4] memory protocolAfter = hook.protocolFees();
        assertEq(protocolAfter[NVDA], protocolBefore[NVDA], "protocol takes nothing from the gap");
        assertApproxEqRel(hook.poolPriceUsd(NVDA), 210e18, 0.002e18, "pool now near the Monday price");
    }

    function test_mondayGap_closingTheWholeGapIsStillTheBotsBestTrade() public {
        _report(210e18, 250e18, 500e18, true);
        uint256 full = _usdcToReach(210e18);
        int256 best = _botProfit(full, 210e18);
        assertGt(best, 0);
        assertGt(best, _botProfit(full / 2, 210e18));
        assertGt(best, _botProfit(full * 3 / 2, 210e18));
    }

    function test_mondayGap_splittingTheTradeDoesNotDodgeTheFee() public {
        _report(210e18, 250e18, 500e18, true);
        uint256 full = _usdcToReach(210e18);
        _fund(bot, 0, 0, 0, full);
        uint256 edges;
        for (uint256 k; k < 10; ++k) {
            edges += hook.quote(USDC, NVDA, full / 10).edgeUsd;
            _swap(bot, USDC, NVDA, full / 10);
        }
        assertApproxEqRel(hook.gapCapturedUsd(), edges * 8 / 10, 0.02e18);
    }

    // ------------------------------------------------------------------
    // Joining and leaving
    // ------------------------------------------------------------------

    function test_joinThenExit_returnsTheSameSlice() public {
        _fund(alice, 12.5e18, 10e18, 5e18, 2_500e6);
        vm.prank(alice);
        uint256 shares = hook.join([uint256(12.5e18), 10e18, 5e18, 2_500e6], 0);
        assertEq(shares, 10_000e18);

        vm.prank(alice);
        uint256[4] memory out = hook.exit(shares, [uint256(0), 0, 0, 0]);
        assertApproxEqAbs(out[NVDA], 12.5e18, 10);
        assertApproxEqAbs(out[USDC], 2_500e6, 1);
        assertEq(hook.balanceOf(alice), 0);
    }

    function test_buyWithUsdc_thenSell_costsOnlyFeesAndImpact() public {
        _fund(alice, 0, 0, 0, 1_000e6);
        vm.prank(alice);
        uint256 shares = hook.joinSingle(USDC, 1_000e6, 0);
        assertLt(shares, 997.75e18, "pays 3/4 of the 0.30% fee");
        assertGt(shares, 990e18);

        vm.prank(alice);
        uint256 back = hook.exitSingle(USDC, shares, 0);
        assertLt(back, 1_000e6);
        assertGt(back, 990e6);
    }

    function test_plainLiquidityIsBlocked() public {
        PoolKey memory key = hook.poolKey(NVDA, USDC);
        vm.expectRevert();
        modifyLiquidityRouter.modifyLiquidity(key, LIQUIDITY_PARAMS, ZERO_BYTES);
    }

    function test_exactOutputIsRejected() public {
        PoolKey memory key = hook.poolKey(NVDA, USDC);
        vm.expectRevert();
        swapRouter.swap(
            key,
            SwapParams({zeroForOne: true, amountSpecified: 1e18, sqrtPriceLimitX96: MIN_PRICE_LIMIT}),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ZERO_BYTES
        );
    }

    function test_protocolFeesCanBeCollected() public {
        _fund(alice, 0, 0, 0, 10_000e6);
        _swap(alice, USDC, NVDA, 10_000e6);
        uint256[4] memory owed = hook.protocolFees();
        address treasury = makeAddr("treasury");
        hook.collectProtocolFees(treasury);
        assertGt(owed[NVDA], 0);
        assertEq(nvda.balanceOf(treasury), owed[NVDA]);
    }

    // ------------------------------------------------------------------
    // Market clock
    // ------------------------------------------------------------------

    function test_marketClock_acceptsOnlyTheForwarderAndOwner() public {
        uint256[] memory prices = new uint256[](3);
        (prices[0], prices[1], prices[2]) = (1e18, 1e18, 1e18);
        bytes memory report = abi.encode(prices, false);

        vm.prank(alice);
        vm.expectRevert(MarketClock.NotForwarder.selector);
        clock.onReport("", report);

        vm.prank(alice);
        vm.expectRevert(MarketClock.NotOwner.selector);
        clock.push(report);

        vm.prank(forwarder);
        clock.onReport("", report);
        assertFalse(clock.marketOpen());
        (uint256 price,) = clock.priceOf(address(nvda));
        assertEq(price, 1e18);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function _report(uint256 pNvda, uint256 pAapl, uint256 pMsft, bool open) internal {
        uint256[] memory prices = new uint256[](3);
        (prices[0], prices[1], prices[2]) = (pNvda, pAapl, pMsft);
        clock.push(abi.encode(prices, open));
    }

    function _fund(address who, uint256 n, uint256 a, uint256 m, uint256 u) internal {
        if (n > 0) nvda.mint(who, n);
        if (a > 0) aapl.mint(who, a);
        if (m > 0) msft.mint(who, m);
        if (u > 0) usdc.mint(who, u);
        vm.startPrank(who);
        nvda.approve(address(hook), type(uint256).max);
        aapl.approve(address(hook), type(uint256).max);
        msft.approve(address(hook), type(uint256).max);
        usdc.approve(address(hook), type(uint256).max);
        nvda.approve(address(router), type(uint256).max);
        aapl.approve(address(router), type(uint256).max);
        msft.approve(address(router), type(uint256).max);
        usdc.approve(address(router), type(uint256).max);
        vm.stopPrank();
    }

    function _swap(address who, uint8 assetIn, uint8 assetOut, uint256 amountIn) internal returns (uint256) {
        PoolKey memory key = hook.poolKey(assetIn, assetOut);
        (address[4] memory tokens,) = hook.assets();
        bool zeroForOne = Currency.unwrap(key.currency0) == tokens[assetIn];
        vm.prank(who);
        return router.swapExactIn(key, zeroForOne, amountIn, 0, who);
    }

    /// @dev USDC that moves the NVDA/USDC curve to `price` (18 decimals): newUsdc = sqrt(k * price / 1e30).
    function _usdcToReach(uint256 price) internal view returns (uint256) {
        uint256[4] memory r = hook.reserves();
        return FixedPointMathLib.sqrt(r[USDC] * r[NVDA] * price / 1e30) - r[USDC];
    }

    /// @dev The bot's profit in USD (18 decimals) when it buys NVDA with USDC and values it at `price`.
    function _botProfit(uint256 usdcIn, uint256 price) internal view returns (int256) {
        BasketHook.Quote memory q = hook.quote(USDC, NVDA, usdcIn);
        return int256(q.amountOut * price / 1e18) - int256(usdcIn * 1e12);
    }
}
