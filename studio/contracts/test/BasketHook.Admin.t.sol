// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {BasketBase} from "./BasketBase.t.sol";
import {BasketHook} from "../BasketHook.sol";
import {BasketRouter} from "../BasketRouter.sol";
import {MarketClock} from "../MarketClock.sol";
import {MockStock} from "../MockStock.sol";

contract BasketAdminTest is BasketBase {
    // ------------------------------------------------ 8. plain liquidity / exact output

    function test_PlainLiquidity_RevertsWithPlainLiquidityDisabled() public {
        PoolKey memory k = hook.poolKey(address(nvda), address(usdc));
        vm.expectRevert(); // bytes-agnostic: v4 wraps hook errors
        modifyLiquidityRouter.modifyLiquidity(k, LIQUIDITY_PARAMS, ZERO_BYTES);

        try modifyLiquidityRouter.modifyLiquidity(k, LIQUIDITY_PARAMS, ZERO_BYTES) {
            fail("plain LP must revert");
        } catch (bytes memory err) {
            assertTrue(_hasSel(err, BasketHook.PlainLiquidityDisabled.selector), "PlainLiquidityDisabled");
        }
        _assertClaimsMatch();
    }

    function test_ExactOutputSwap_Reverts() public {
        PoolKey memory k = hook.poolKey(address(nvda), address(usdc));
        bool zfo = address(nvda) < address(usdc);
        SwapParams memory p = SwapParams({
            zeroForOne: zfo, amountSpecified: 1e6, sqrtPriceLimitX96: zfo ? MIN_PRICE_LIMIT : MAX_PRICE_LIMIT
        });
        PoolSwapTest.TestSettings memory ts = PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false});
        vm.expectRevert();
        swapRouter.swap(k, p, ts, ZERO_BYTES);
        try swapRouter.swap(k, p, ts, ZERO_BYTES) {
            fail("exact output must revert");
        } catch (bytes memory err) {
            assertTrue(_hasSel(err, BasketHook.ExactOutputNotSupported.selector), "ExactOutputNotSupported");
        }
    }

    // ------------------------------------------------------- beforeInitialize

    function _initKey(address a, address b, uint24 fee, int24 spacing) internal view returns (PoolKey memory) {
        (address c0, address c1) = a < b ? (a, b) : (b, a);
        return PoolKey(Currency.wrap(c0), Currency.wrap(c1), fee, spacing, IHooks(address(hook)));
    }

    function test_BeforeInitialize_RejectsNonZeroFee() public {
        PoolKey memory k = _initKey(address(nvda), address(usdc), 3000, 60);
        _assertFailsWith(
            address(manager), abi.encodeCall(IPoolManager.initialize, (k, uint160(2 ** 96))), BasketHook.InvalidPool.selector
        );
    }

    function test_BeforeInitialize_RejectsWrongTickSpacing() public {
        PoolKey memory k = _initKey(address(nvda), address(usdc), 0, 10);
        _assertFailsWith(
            address(manager), abi.encodeCall(IPoolManager.initialize, (k, uint160(2 ** 96))), BasketHook.InvalidPool.selector
        );
    }

    function test_BeforeInitialize_RejectsNonBasketTokens() public {
        MockERC20 x = new MockERC20("X", "X", 18);
        MockERC20 y = new MockERC20("Y", "Y", 18);
        PoolKey memory both = _initKey(address(x), address(y), 0, 60);
        _assertFailsWith(
            address(manager), abi.encodeCall(IPoolManager.initialize, (both, uint160(2 ** 96))), BasketHook.InvalidAsset.selector
        );
        PoolKey memory one = _initKey(address(x), address(nvda), 0, 60);
        _assertFailsWith(
            address(manager), abi.encodeCall(IPoolManager.initialize, (one, uint160(2 ** 96))), BasketHook.InvalidAsset.selector
        );
    }

    function test_PoolKey_RejectsSameOrForeignAsset() public {
        vm.expectRevert(BasketHook.InvalidAsset.selector);
        hook.poolKey(address(nvda), address(nvda));
        vm.expectRevert(BasketHook.InvalidAsset.selector);
        hook.poolKey(address(nvda), address(this));
    }

    function test_Quote_InvalidInputsRevert() public {
        vm.expectRevert(BasketHook.InvalidAmount.selector);
        hook.quote(address(usdc), address(nvda), 0);
        vm.expectRevert(BasketHook.InvalidAsset.selector);
        hook.quote(address(usdc), address(usdc), 1e6);
        vm.expectRevert(BasketHook.InvalidAsset.selector);
        hook.quote(address(usdc), address(this), 1e6);
    }

    function test_Callbacks_OnlyPoolManager() public {
        PoolKey memory k = hook.poolKey(address(nvda), address(usdc));
        vm.expectRevert(BasketHook.OnlyPoolManager.selector);
        hook.beforeInitialize(address(this), k, 2 ** 96);
        vm.expectRevert(BasketHook.OnlyPoolManager.selector);
        hook.unlockCallback("");
        vm.prank(address(manager));
        vm.expectRevert(BasketHook.UnexpectedCallback.selector);
        hook.unlockCallback("");
    }

    // ------------------------------------------------------ 9. protocol fees

    function test_CollectProtocolFees_TransfersExactlyAndZeroesLedger() public {
        // Re-align the reference with the pool before each swap so no gap levy replaces the posted fee.
        _align();
        _swap(bot, US, NV, 2_000e6);
        _align();
        _swap(bot, NV, AA, 6e18);
        _align();
        _swap(bot, AA, MS, 9e18);
        _align();
        _swap(bot, MS, US, 3e18);
        uint256[4] memory pf = hook.protocolFees();
        uint256[4] memory r0 = hook.reserves();
        for (uint256 i; i < 4; ++i) assertGt(pf[i], 0, "each asset earned a protocol fee");

        uint256[4] memory t0;
        for (uint256 i; i < 4; ++i) t0[i] = _bal(assets[i], treasury);
        vm.expectEmit(true, false, false, true, address(hook));
        emit BasketHook.ProtocolFeesCollected(treasury, pf);
        hook.collectProtocolFees(treasury);

        uint256[4] memory pf1 = hook.protocolFees();
        uint256[4] memory r1 = hook.reserves();
        for (uint256 i; i < 4; ++i) {
            assertEq(_bal(assets[i], treasury) - t0[i], pf[i], "transferred exactly the ledger");
            assertEq(pf1[i], 0, "ledger zeroed");
            assertEq(r1[i], r0[i], "shareholder reserves unchanged");
        }
        _assertClaimsMatch();

        hook.collectProtocolFees(treasury); // empty second collect is a harmless no-op
        assertEq(_bal(address(usdc), treasury) - t0[US], pf[US]);
    }

    function test_CollectProtocolFees_OnlyOwnerAndNonZeroRecipient() public {
        _swap(bot, US, NV, 1_000e6);
        vm.prank(bot);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bot));
        hook.collectProtocolFees(bot);
        vm.expectRevert(BasketHook.InvalidAsset.selector);
        hook.collectProtocolFees(address(0));
        assertGt(hook.protocolFees()[NV], 0, "failed collects leave ledger intact");
    }

    function _bal(address token, address who) internal view returns (uint256) {
        return MockERC20(token).balanceOf(who);
    }

    // ------------------------------------------------------------ admin

    function test_SetFees_HappyPathEmitsAndStores() public {
        vm.expectEmit(false, false, false, true, address(hook));
        emit BasketHook.FeesSet(10, 20, 300, 500);
        hook.setFees(10, 20, 300, 500);
        assertEq(hook.openFeeBps(), 10);
        assertEq(hook.closedFeeBps(), 20);
        assertEq(hook.staleFeeBps(), 300);
        assertEq(hook.protocolShareBps(), 500);
        assertEq(hook.postedFeeBps(), 10);
        hook.setFees(1, 1, 1000, 2000); // inclusive upper bounds
        hook.setFees(30, 60, 200, 0); // restore, zero protocol share is allowed
        assertEq(hook.protocolShareBps(), 0);
    }

    function test_SetFees_BoundsRevert() public {
        vm.expectRevert(BasketHook.InvalidConfiguration.selector);
        hook.setFees(0, 60, 200, 1000); // open must be > 0
        vm.expectRevert(BasketHook.InvalidConfiguration.selector);
        hook.setFees(61, 60, 200, 1000); // open > closed
        vm.expectRevert(BasketHook.InvalidConfiguration.selector);
        hook.setFees(30, 201, 200, 1000); // closed > stale
        vm.expectRevert(BasketHook.InvalidConfiguration.selector);
        hook.setFees(30, 60, 1001, 1000); // stale > 10%
        vm.expectRevert(BasketHook.InvalidConfiguration.selector);
        hook.setFees(30, 60, 200, 2001); // protocol share > 20%
    }

    function test_SetFees_And_SetMaxPriceAge_OnlyOwner() public {
        vm.startPrank(bot);
        bytes memory err = abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bot);
        vm.expectRevert(err);
        hook.setFees(30, 60, 200, 1000);
        vm.expectRevert(err);
        hook.setMaxPriceAge(1 hours);
        vm.stopPrank();
    }

    function test_SetMaxPriceAge_BoundsAndEffect() public {
        vm.expectRevert(BasketHook.InvalidConfiguration.selector);
        hook.setMaxPriceAge(5 minutes - 1);
        vm.expectRevert(BasketHook.InvalidConfiguration.selector);
        hook.setMaxPriceAge(3 days + 1);
        hook.setMaxPriceAge(5 minutes);
        hook.setMaxPriceAge(3 days);
        vm.expectEmit(false, false, false, true, address(hook));
        emit BasketHook.MaxPriceAgeSet(1 hours);
        hook.setMaxPriceAge(1 hours);
        assertEq(hook.maxPriceAge(), 1 hours);

        vm.warp(T0 + 1 hours);
        assertEq(hook.postedFeeBps(), 30);
        vm.warp(T0 + 1 hours + 1);
        assertEq(hook.postedFeeBps(), 200);
    }

    // ------------------------------------------------------ constructor

    function test_Constructor_RejectsBadConfigurations() public {
        address[4] memory a = assets;
        a[1] = address(nvda); // duplicate
        vm.expectRevert(BasketHook.InvalidAsset.selector);
        new BasketHook(manager, clock, a, address(this));

        a = assets;
        a[2] = address(0);
        vm.expectRevert(BasketHook.InvalidAsset.selector);
        new BasketHook(manager, clock, a, address(this));

        a = assets;
        a[3] = address(new MockERC20("USDC18", "USDC18", 18)); // USDC must be 6dp
        vm.expectRevert(BasketHook.InvalidConfiguration.selector);
        new BasketHook(manager, clock, a, address(this));

        a = assets;
        a[0] = address(new MockERC20("S6", "S6", 6)); // stocks must be 18dp
        vm.expectRevert(BasketHook.InvalidConfiguration.selector);
        new BasketHook(manager, clock, a, address(this));

        vm.expectRevert(BasketHook.InvalidConfiguration.selector);
        new BasketHook(IPoolManager(address(0)), clock, assets, address(this));
        vm.expectRevert(BasketHook.InvalidConfiguration.selector);
        new BasketHook(manager, MarketClock(address(0)), assets, address(this));
    }

    function test_Constructor_StoresConfiguration() public view {
        assertEq(address(hook.poolManager()), address(manager));
        assertEq(address(hook.clock()), address(clock));
        assertEq(hook.owner(), address(this));
        address[4] memory a = hook.assets();
        for (uint256 i; i < 4; ++i) assertEq(a[i], assets[i]);
        assertEq(hook.assetDecimals(3), 6);
        assertEq(hook.assetDecimals(0), 18);
        assertEq(hook.openFeeBps(), 30);
        assertEq(hook.closedFeeBps(), 60);
        assertEq(hook.staleFeeBps(), 200);
        assertEq(hook.protocolShareBps(), 1000);
        assertEq(hook.maxPriceAge(), 6 hours);
    }

    // --------------------------------------------------------- MockStock

    function test_MockStock_OnlyOwnerMints() public {
        vm.prank(bot);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bot));
        nvda.mint(bot, 1);
        uint256 b = nvda.balanceOf(treasury);
        nvda.mint(treasury, 5e18);
        assertEq(nvda.balanceOf(treasury) - b, 5e18);
        assertEq(nvda.decimals(), 18);
    }

    // ------------------------------------------------------------ router

    function test_Router_SlippageRevertsAtomically() public {
        PoolKey memory k = hook.poolKey(address(usdc), address(nvda));
        bool zfo = address(usdc) < address(nvda);
        uint256 quoted = hook.quote(address(usdc), address(nvda), 1_000e6).amountOut;
        uint256 u0 = usdc.balanceOf(bot);
        vm.prank(bot);
        vm.expectRevert(BasketRouter.Slippage.selector);
        router.swapExactInput(k, zfo, 1_000e6, quoted + 1, bot);
        assertEq(usdc.balanceOf(bot), u0, "no funds moved");
        vm.prank(bot);
        assertEq(router.swapExactInput(k, zfo, 1_000e6, quoted, treasury), quoted);
        assertEq(nvda.balanceOf(treasury), quoted, "recipient receives output");
    }

    function test_Router_InputValidation() public {
        PoolKey memory k = hook.poolKey(address(usdc), address(nvda));
        bool zfo = address(usdc) < address(nvda);
        vm.startPrank(bot);
        vm.expectRevert(BasketRouter.InvalidAddress.selector);
        router.swapExactInput(k, zfo, 1e6, 0, address(0));
        vm.expectRevert(BasketRouter.InvalidAmount.selector);
        router.swapExactInput(k, zfo, 0, 0, bot);
        vm.expectRevert(BasketRouter.InvalidAmount.selector);
        router.swapExactInput(k, zfo, uint256(type(uint128).max), 0, bot);
        k.currency0 = Currency.wrap(address(0));
        vm.expectRevert(BasketRouter.NativeCurrencyNotSupported.selector);
        router.swapExactInput(k, zfo, 1e6, 0, bot);
        vm.stopPrank();
        vm.expectRevert(BasketRouter.OnlyPoolManager.selector);
        router.unlockCallback("");
        vm.prank(address(manager));
        vm.expectRevert(BasketRouter.UnexpectedCallback.selector);
        router.unlockCallback("");
        vm.expectRevert(BasketRouter.InvalidAddress.selector);
        new BasketRouter(IPoolManager(address(0)));
    }
}
