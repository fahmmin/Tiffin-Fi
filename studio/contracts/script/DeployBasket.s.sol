// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/test/shared/HookMiner.sol";
import {MockStock} from "../MockStock.sol";
import {MarketClock} from "../MarketClock.sol";
import {BasketHook} from "../BasketHook.sol";
import {BasketRouter} from "../BasketRouter.sol";

/// @notice Deploys Tiffin Fi on Arc testnet; intentionally does NOT join or approve/transfer USDC.
/// @dev Forge broadcasts salted new via the canonical CREATE2 proxy (0x4e59...956C).
/// PRIVATE_KEY is required; optional USDC, POOL_MANAGER, SEED_USD (whole USD per slice), MARKET_OPEN.
/// Reference prices are USD18 [200,250,500]. Assets remain semantic [NVDA,AAPL,MSFT,USDC] order;
/// only poolKey sorts currency addresses. The initial USDC slice defaults to 250000e6.
///
/// Manual follow-up with a funded broadcaster (substitute actual logged addresses and seed amounts):
/// cast send $USDC "approve(address,uint256)" $HOOK 250000000000 --rpc-url $RPC_URL --private-key $PRIVATE_KEY
/// cast send $HOOK "join(uint256[4],uint256)" "[1250000000000000000000,1000000000000000000000,500000000000000000000,250000000000]" 1000000000000000000000000 --rpc-url $RPC_URL --private-key $PRIVATE_KEY
/// These defaults mint 1,000,000 BSKT; adjust all amounts for SEED_USD. The report must still be fresh
/// at join time; push the report again from the clock owner if more than maxPriceAge has elapsed.
/// USDC transfer/approval calls use Arc's blocklist precompile, unsupported by local script simulation.
contract DeployBasket is Script {
    error HookAddressMismatch();
    error InvalidSeed();

    address private constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    address private constant DEFAULT_USDC = 0x3600000000000000000000000000000000000000;
    address private constant DEFAULT_MANAGER = address(bytes20(hex"8366a39cc670b4001a1121b8f6a443a643e40951"));
    address private constant LIVE_FORWARDER = address(bytes20(hex"76c9cf548b4179f8901cda1f8623568b58215e62"));
    address private constant CLI_FORWARDER = address(bytes20(hex"6e9ee680ef59ef64aa8c7371279c27e496b5edc1"));
    uint160 private constant FLAGS = Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG
        | Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG;

    struct Deployment {
        address[4] assets;
        MarketClock clock;
        BasketHook hook;
        BasketRouter router;
    }

    /// @notice Written deployment recipe; execution and signing are separate operator actions.
    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address broadcaster = vm.addr(privateKey);
        IPoolManager pm = IPoolManager(vm.envOr("POOL_MANAGER", DEFAULT_MANAGER));
        address usdc = vm.envOr("USDC", DEFAULT_USDC);
        uint256 seedUsd = vm.envOr("SEED_USD", uint256(250_000));
        bool open = vm.envOr("MARKET_OPEN", true);
        if (seedUsd == 0) revert InvalidSeed();
        vm.startBroadcast(privateKey);
        Deployment memory deployed = _deploy(pm, usdc, broadcaster, open);
        _initializeAndSeed(pm, deployed, broadcaster, seedUsd);
        vm.stopBroadcast();
        console2.log("PoolManager", address(pm));
        console2.log("USDC", usdc);
        console2.log("tNVDA", deployed.assets[0]);
        console2.log("tAAPL", deployed.assets[1]);
        console2.log("tMSFT", deployed.assets[2]);
        console2.log("MarketClock", address(deployed.clock));
        console2.log("BasketHook / BSKT", address(deployed.hook));
        console2.log("BasketRouter", address(deployed.router));
        console2.log("Owner / seed payer", broadcaster);
        console2.log("CREATE2 deployer", CREATE2_DEPLOYER);
        console2.log("CRE live forwarder", LIVE_FORWARDER);
        console2.log("CRE CLI forwarder", CLI_FORWARDER);
        console2.log("Manual USDC approval / join slice (USDC6)", seedUsd * 1e6);
    }

    function _deploy(IPoolManager pm, address usdc, address broadcaster, bool open)
        private returns (Deployment memory d)
    {
        d.assets[0] = address(new MockStock("tNVDA", "tNVDA", broadcaster));
        d.assets[1] = address(new MockStock("tAAPL", "tAAPL", broadcaster));
        d.assets[2] = address(new MockStock("tMSFT", "tMSFT", broadcaster));
        d.assets[3] = usdc;
        address[] memory forwarders = new address[](2);
        forwarders[0] = LIVE_FORWARDER;
        forwarders[1] = CLI_FORWARDER;
        d.clock = new MarketClock(broadcaster, [d.assets[0], d.assets[1], d.assets[2]], forwarders);
        d.clock.pushReport(abi.encode(_prices(), open));
        bytes memory args = abi.encode(pm, d.clock, d.assets, broadcaster);
        (address predicted, bytes32 salt) = HookMiner.find(CREATE2_DEPLOYER, FLAGS, type(BasketHook).creationCode, args);
        d.hook = new BasketHook{salt: salt}(pm, d.clock, d.assets, broadcaster);
        if (address(d.hook) != predicted) revert HookAddressMismatch();
        d.router = new BasketRouter(pm);
    }

    function _initializeAndSeed(IPoolManager pm, Deployment memory d, address broadcaster, uint256 seedUsd) private {
        for (uint256 i; i < 4; ++i) {
            for (uint256 j = i + 1; j < 4; ++j) {
                pm.initialize(d.hook.poolKey(d.assets[i], d.assets[j]), uint160(1 << 96));
            }
        }
        uint256[] memory prices = _prices();
        for (uint256 i; i < 3; ++i) {
            uint256 slice = seedUsd * 1e36 / prices[i];
            MockStock stock = MockStock(d.assets[i]);
            stock.mint(broadcaster, slice);
            stock.approve(address(d.hook), slice);
            console2.log("Stock seed slice (raw)", slice);
        }
        // Never call USDC approve/transfer here; joining is deliberately a separate cast transaction.
    }

    function _prices() private pure returns (uint256[] memory prices) {
        prices = new uint256[](3);
        prices[0] = 200e18;
        prices[1] = 250e18;
        prices[2] = 500e18;
    }
}
