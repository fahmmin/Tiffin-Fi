// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";
import {HookMiner} from "@uniswap/v4-periphery/test/shared/HookMiner.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MockStock} from "../MockStock.sol";
import {MarketClock} from "../MarketClock.sol";
import {BasketHook} from "../BasketHook.sol";
import {BasketRouter} from "../BasketRouter.sol";
import {BasketBootstrap} from "../BasketBootstrap.sol";

contract BasketBootstrapTest is Deployers {
    using PoolIdLibrary for PoolKey;

    address internal constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    bytes internal constant ARACHNID_RUNTIME =
        hex"7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3";
    uint160 internal constant FLAGS = Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG
        | Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG;
    uint160 internal constant SQRT_1_1 = 79228162514264337593543950336;

    MockStock internal nvda;
    MockStock internal aapl;
    MockStock internal msft;
    MockERC20 internal usdc;
    MarketClock internal clock;
    address[3] internal stocks;
    address[4] internal assets;

    address internal hookOwner = makeAddr("hookOwner");
    address internal bot = makeAddr("bot");

    address internal predicted;
    bytes32 internal salt;

    function setUp() public {
        vm.warp(1_700_000_000);
        deployFreshManagerAndRouters();
        nvda = new MockStock("tNVDA", "tNVDA", address(this));
        aapl = new MockStock("tAAPL", "tAAPL", address(this));
        msft = new MockStock("tMSFT", "tMSFT", address(this));
        usdc = new MockERC20("USDC", "USDC", 6);
        stocks = [address(nvda), address(aapl), address(msft)];
        assets = [address(nvda), address(aapl), address(msft), address(usdc)];
        clock = new MarketClock(address(this), stocks, new address[](0));
        clock.pushReport(_report(200e18, 250e18, 500e18));

        vm.etch(CREATE2_DEPLOYER, ARACHNID_RUNTIME);
        (predicted, salt) = HookMiner.find(
            CREATE2_DEPLOYER, FLAGS, type(BasketHook).creationCode, abi.encode(manager, clock, assets, hookOwner)
        );
    }

    function _report(uint256 a, uint256 b, uint256 c) internal pure returns (bytes memory) {
        uint256[] memory p = new uint256[](3);
        p[0] = a;
        p[1] = b;
        p[2] = c;
        return abi.encode(p, true);
    }

    function _bootstrap(address owner_, bytes32 salt_) internal returns (BasketBootstrap) {
        return new BasketBootstrap(manager, clock, stocks, address(usdc), owner_, salt_);
    }

    function _addr(bytes32 salt_, address owner_) internal view returns (address) {
        bytes memory initCode = abi.encodePacked(
            type(BasketHook).creationCode, abi.encode(manager, clock, assets, owner_)
        );
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), CREATE2_DEPLOYER, salt_, keccak256(initCode))))));
    }

    /// @dev Revert data must start with one of the two acceptable failure selectors.
    function _expectDeployFailure(address owner_, bytes32 salt_) internal {
        try new BasketBootstrap(manager, clock, stocks, address(usdc), owner_, salt_) returns (BasketBootstrap) {
            fail("bootstrap should have reverted");
        } catch (bytes memory err) {
            bytes4 sel = bytes4(err);
            assertTrue(
                sel == BasketBootstrap.HookDeploymentFailed.selector || sel == BasketBootstrap.WrongHookFlags.selector,
                "expected HookDeploymentFailed or WrongHookFlags"
            );
        }
    }

    // ------------------------------------------------------------ deployment

    function test_FlagsConstantIs0x2888() public pure {
        assertEq(uint256(FLAGS), 0x2888);
    }

    function test_Bootstrap_DeploysHookAtPredictedAddressWithExactFlagBits() public {
        assertEq(predicted, _addr(salt, hookOwner), "miner and independent CREATE2 agree");
        vm.expectEmit(true, false, false, true);
        emit BasketBootstrap.Bootstrapped(predicted, salt);
        BasketBootstrap b = _bootstrap(hookOwner, salt);

        address hook = b.hook();
        assertEq(hook, predicted);
        assertGt(hook.code.length, 0);
        assertEq(uint160(hook) & Hooks.ALL_HOOK_MASK, 0x2888, "exactly the four required flag bits");
    }

    function test_Bootstrap_WiresOwnerManagerClockAndAssets() public {
        BasketBootstrap b = _bootstrap(hookOwner, salt);
        BasketHook hook = BasketHook(b.hook());
        assertEq(hook.owner(), hookOwner);
        assertTrue(hook.owner() != address(this), "owner is not the deployer");
        assertTrue(hook.owner() != address(b), "owner is not the bootstrap");
        assertEq(address(hook.poolManager()), address(manager));
        assertEq(address(hook.clock()), address(clock));
        address[4] memory a = hook.assets();
        for (uint256 i; i < 4; ++i) assertEq(a[i], assets[i]);
        for (uint256 i; i < 3; ++i) assertEq(clock.stocks(i), a[i], "clock stocks match hook stocks");
    }

    function test_Bootstrap_InitialisesAllSixPoolsAtOneToOne() public {
        BasketBootstrap b = _bootstrap(hookOwner, salt);
        BasketHook hook = BasketHook(b.hook());
        uint256 n;
        for (uint256 i; i < 4; ++i) {
            for (uint256 j = i + 1; j < 4; ++j) {
                PoolKey memory key = hook.poolKey(assets[i], assets[j]);
                (uint160 sqrtP, int24 tick,, uint24 lpFee) = StateLibrary.getSlot0(manager, key.toId());
                assertEq(sqrtP, SQRT_1_1, "sqrtPriceX96 == 2**96");
                assertEq(sqrtP, 2 ** 96);
                assertEq(tick, 0);
                assertEq(lpFee, 0);
                assertEq(address(key.hooks), address(hook));
                ++n;
            }
        }
        assertEq(n, 6);
    }

    function test_Bootstrap_SecondDeployWithSameSaltReverts() public {
        _bootstrap(hookOwner, salt);
        vm.expectRevert(BasketBootstrap.HookDeploymentFailed.selector);
        _bootstrap(hookOwner, salt);
    }

    function test_Bootstrap_WrongSaltReverts() public {
        bytes32 bad = bytes32(uint256(1));
        while ((uint160(_addr(bad, hookOwner)) & Hooks.ALL_HOOK_MASK) == FLAGS) bad = bytes32(uint256(bad) + 1);
        assertTrue((uint160(_addr(bad, hookOwner)) & Hooks.ALL_HOOK_MASK) != FLAGS);
        _expectDeployFailure(hookOwner, bad);
    }

    function test_Bootstrap_MinedSaltIsBoundToTheOwnerArgument() public {
        address other = makeAddr("other");
        assertTrue(_addr(salt, other) != predicted);
        if ((uint160(_addr(salt, other)) & Hooks.ALL_HOOK_MASK) != FLAGS) {
            _expectDeployFailure(other, salt); // different args => different address => bad flags
        }
    }

    function test_Bootstrap_ZeroOwnerReverts() public {
        vm.expectRevert(BasketBootstrap.InvalidOwner.selector);
        _bootstrap(address(0), salt);
    }

    function test_Bootstrap_MissingCreate2DeployerReverts() public {
        vm.etch(CREATE2_DEPLOYER, "");
        vm.expectRevert(BasketBootstrap.HookDeploymentFailed.selector);
        _bootstrap(hookOwner, salt);
    }

    function test_Bootstrap_SecondHookForDifferentOwnerAlsoBootstraps() public {
        // A second hook for a different owner only needs its own mined salt.
        address owner2 = makeAddr("owner2");
        (address p2, bytes32 s2) = HookMiner.find(
            CREATE2_DEPLOYER, FLAGS, type(BasketHook).creationCode, abi.encode(manager, clock, assets, owner2)
        );
        BasketBootstrap b1 = _bootstrap(hookOwner, salt);
        // Pools are already initialised by b1 on this manager (different hook => different PoolKey).
        BasketBootstrap b2 = _bootstrap(owner2, s2);
        assertEq(b2.hook(), p2);
        assertTrue(b1.hook() != b2.hook());
        assertEq(BasketHook(b2.hook()).owner(), owner2);
    }

    // --------------------------------------------------------- end to end

    function test_BootstrappedHook_OwnerSeedsAndRouterSwapWorks() public {
        BasketBootstrap b = _bootstrap(hookOwner, salt);
        BasketHook hook = BasketHook(b.hook());

        // Only the explicit owner can seed; the deployer (this test) is not the owner.
        uint256[4] memory seed = [uint256(1250e18), 1000e18, 500e18, 250_000e6];
        for (uint256 i; i < 3; ++i) MockStock(assets[i]).mint(hookOwner, seed[i]);
        usdc.mint(hookOwner, seed[3]);
        vm.startPrank(hookOwner);
        for (uint256 i; i < 4; ++i) IERC20(assets[i]).approve(address(hook), type(uint256).max);
        vm.stopPrank();

        vm.expectRevert(BasketHook.SeedOwnerOnly.selector);
        hook.join(seed, 0);

        vm.prank(hookOwner);
        uint256 shares = hook.join(seed, 0);
        assertEq(shares, 1_000_000e18);
        assertEq(hook.balanceOf(hookOwner), shares);
        uint256[4] memory r = hook.reserves();
        for (uint256 i; i < 4; ++i) assertEq(r[i], seed[i]);

        BasketRouter router = new BasketRouter(manager);
        usdc.mint(bot, 1_000e6);
        vm.startPrank(bot);
        usdc.approve(address(router), type(uint256).max);
        PoolKey memory k = hook.poolKey(address(usdc), address(nvda));
        uint256 out = router.swapExactInput(k, address(usdc) < address(nvda), 1_000e6, 0, bot);
        vm.stopPrank();

        uint256 gross = seed[0] * 1_000e6 / (seed[3] + 1_000e6);
        uint256 fee = gross * 30 / 10_000;
        assertEq(out, gross - fee, "x*y=k less the 0.30% posted fee");
        assertEq(nvda.balanceOf(bot), out);
        assertEq(hook.protocolFees()[0], fee / 10);
    }

    function test_BootstrappedHook_OnlyExplicitOwnerIsAdmin() public {
        BasketBootstrap b = _bootstrap(hookOwner, salt);
        BasketHook hook = BasketHook(b.hook());
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        hook.setMaxPriceAge(1 hours);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(b)));
        vm.prank(address(b));
        hook.setMaxPriceAge(1 hours);
        vm.prank(hookOwner);
        hook.setMaxPriceAge(1 hours);
        assertEq(hook.maxPriceAge(), 1 hours);
    }
}
