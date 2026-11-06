// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {HookMiner} from "@uniswap/v4-periphery/test/shared/HookMiner.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {BasketHook} from "../src/BasketHook.sol";
import {BasketRouter} from "../src/BasketRouter.sol";
import {MarketClock} from "../src/MarketClock.sol";
import {MockStock} from "../src/MockStock.sol";

/// @notice Deploys the basket on Arc testnet against Uniswap's PoolManager and Arc's USDC, opens the six pools,
/// writes the first market report and seeds the fund with equal dollar slices.
/// Env: PRIVATE_KEY, NVDA_PRICE / AAPL_PRICE / MSFT_PRICE (USD, 18 decimals), MARKET_OPEN, SEED_USDC (6 decimals).
contract Deploy is Script {
    IPoolManager constant POOL_MANAGER = IPoolManager(0x8366a39CC670B4001A1121B8F6A443A643e40951);
    address constant USDC = 0x3600000000000000000000000000000000000000;
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    /// Chainlink CRE forwarders on Arc testnet: the live one and the one CLI simulations broadcast through.
    address constant CRE_FORWARDER = 0x76c9cf548b4179F8901cda1f8623568b58215E62;
    address constant CRE_SIMULATION_FORWARDER = 0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1;
    uint160 constant SQRT_PRICE_1_1 = 79228162514264337593543950336;
    uint160 constant FLAGS = uint160(
        Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG
            | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG
    );

    struct Deployed {
        MockStock nvda;
        MockStock aapl;
        MockStock msft;
        MarketClock clock;
        BasketHook hook;
        BasketRouter router;
    }

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address me = vm.addr(pk);
        uint256[] memory prices = _prices();
        Deployed memory d;

        vm.startBroadcast(pk);
        _deployClock(d, me, prices);
        vm.stopBroadcast();

        (address expected, bytes32 salt) = HookMiner.find(
            CREATE2_DEPLOYER,
            FLAGS,
            type(BasketHook).creationCode,
            abi.encode(POOL_MANAGER, d.clock, _stocks(d), Currency.wrap(USDC), me)
        );

        vm.startBroadcast(pk);
        _deployHook(d, me, salt);
        require(address(d.hook) == expected, "hook address mismatch");
        uint256[4] memory seed = _prepareSeed(d, me, prices, vm.envUint("SEED_USDC"));
        vm.stopBroadcast();

        _write(d, seed);
    }

    function _prices() internal view returns (uint256[] memory prices) {
        prices = new uint256[](3);
        prices[0] = vm.envUint("NVDA_PRICE");
        prices[1] = vm.envUint("AAPL_PRICE");
        prices[2] = vm.envUint("MSFT_PRICE");
    }

    function _deployClock(Deployed memory d, address me, uint256[] memory prices) internal {
        d.nvda = new MockStock("Test Nvidia", "tNVDA", me);
        d.aapl = new MockStock("Test Apple", "tAAPL", me);
        d.msft = new MockStock("Test Microsoft", "tMSFT", me);
        address[] memory stocks = new address[](3);
        (stocks[0], stocks[1], stocks[2]) = (address(d.nvda), address(d.aapl), address(d.msft));
        address[] memory forwarders = new address[](2);
        (forwarders[0], forwarders[1]) = (CRE_FORWARDER, CRE_SIMULATION_FORWARDER);
        d.clock = new MarketClock(me, stocks, forwarders);
        d.clock.push(abi.encode(prices, vm.envBool("MARKET_OPEN")));
    }

    function _deployHook(Deployed memory d, address me, bytes32 salt) internal {
        d.hook = new BasketHook{salt: salt}(POOL_MANAGER, d.clock, _stocks(d), Currency.wrap(USDC), me);
        d.router = new BasketRouter(POOL_MANAGER);
        for (uint8 a; a < 4; ++a) {
            for (uint8 b = a + 1; b < 4; ++b) {
                POOL_MANAGER.initialize(d.hook.poolKey(a, b), SQRT_PRICE_1_1);
            }
        }
    }

    /// @dev Mints and approves equal dollar slices at the reported prices, so the first share is worth about $1.
    /// The join itself is sent by scripts/seed.mjs: Arc's USDC checks a blocklist precompile that Foundry's local
    /// simulation doesn't have, so any USDC transfer has to go straight to the chain.
    function _prepareSeed(Deployed memory d, address me, uint256[] memory prices, uint256 seedUsdc)
        internal
        returns (uint256[4] memory amounts)
    {
        for (uint256 i; i < 3; ++i) {
            amounts[i] = seedUsdc * 1e12 * 1e18 / prices[i];
        }
        amounts[3] = seedUsdc;
        d.nvda.mint(me, amounts[0]);
        d.aapl.mint(me, amounts[1]);
        d.msft.mint(me, amounts[2]);
        address[4] memory tokens = [address(d.nvda), address(d.aapl), address(d.msft), USDC];
        for (uint256 i; i < 4; ++i) {
            ERC20(tokens[i]).approve(address(d.hook), type(uint256).max);
            ERC20(tokens[i]).approve(address(d.router), type(uint256).max);
        }
    }

    function _stocks(Deployed memory d) internal pure returns (Currency[3] memory) {
        return [Currency.wrap(address(d.nvda)), Currency.wrap(address(d.aapl)), Currency.wrap(address(d.msft))];
    }

    function _write(Deployed memory d, uint256[4] memory seed) internal {
        string memory o = "deployment";
        uint256[] memory seedList = new uint256[](4);
        for (uint256 i; i < 4; ++i) {
            seedList[i] = seed[i];
        }
        vm.serializeUint(o, "seed", seedList);
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeAddress(o, "poolManager", address(POOL_MANAGER));
        vm.serializeAddress(o, "usdc", USDC);
        vm.serializeAddress(o, "nvda", address(d.nvda));
        vm.serializeAddress(o, "aapl", address(d.aapl));
        vm.serializeAddress(o, "msft", address(d.msft));
        vm.serializeAddress(o, "clock", address(d.clock));
        vm.serializeAddress(o, "router", address(d.router));
        string memory json = vm.serializeAddress(o, "hook", address(d.hook));
        vm.writeJson(json, "./deployments/arc-testnet.json");
        console2.log("hook", address(d.hook));
        console2.log("router", address(d.router));
        console2.log("clock", address(d.clock));
    }
}
