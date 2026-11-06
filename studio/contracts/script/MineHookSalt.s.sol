// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {HookMiner} from "@uniswap/v4-periphery/test/shared/HookMiner.sol";
import {BasketHook} from "../BasketHook.sol";
import {MarketClock} from "../MarketClock.sol";

/// @notice Offline helper (no broadcast): mines the CREATE2 salt for BasketHook so its address carries
/// the beforeInitialize, beforeAddLiquidity, beforeSwap and beforeSwapReturnDelta flags.
/// Env: POOL_MANAGER, CLOCK, NVDA, AAPL, MSFT, USDC, HOOK_OWNER.
contract MineHookSalt is Script {
    address private constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    function run() external view {
        address[4] memory assets = [vm.envAddress("NVDA"), vm.envAddress("AAPL"), vm.envAddress("MSFT"), vm.envAddress("USDC")];
        bytes memory args = abi.encode(
            IPoolManager(vm.envAddress("POOL_MANAGER")), MarketClock(vm.envAddress("CLOCK")), assets, vm.envAddress("HOOK_OWNER")
        );
        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG
                | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG
        );
        (address hookAddress, bytes32 salt) = HookMiner.find(CREATE2_DEPLOYER, flags, type(BasketHook).creationCode, args);
        console2.log("hook", hookAddress);
        console2.logBytes32(salt);
    }
}
