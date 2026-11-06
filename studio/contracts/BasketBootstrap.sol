// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {BasketHook} from "./BasketHook.sol";
import {MarketClock} from "./MarketClock.sol";

/// @title One-shot Tiffin Fi hook deployment and pool initialization
/// @notice Deploy with a plain contract-creation transaction and a pre-mined CREATE2 salt.
/// @dev The hook address must encode its permission flags in its low 14 bits, so the hook
/// must come from CREATE2 with a mined salt rather than an ordinary CREATE deployment.
/// The returned address is independently recomputed from the canonical deployer, salt,
/// and exact init code, then its flags are checked before accepting it or initializing pools.
/// All work is constructor-only and atomic. The explicit owner receives hook ownership;
/// this helper retains no privileges and its runtime exposes only the hook getter.
contract BasketBootstrap {
    error InvalidOwner();
    error HookDeploymentFailed();
    error HookAddressMismatch(address returnedHook, address expectedHook);
    error WrongHookFlags(address hook);

    address private constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    uint160 private constant FLAGS = Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG
        | Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG;
    uint160 private constant SQRT_PRICE_1_1 = 79228162514264337593543950336;

    address public immutable hook;

    event Bootstrapped(address indexed hook, bytes32 salt);

    /// @param poolManager The Uniswap v4 manager used by the hook and all six pools.
    /// @param clock The reference-price clock used by the hook.
    /// @param stocks Stock token addresses in [NVDA, AAPL, MSFT] order.
    /// @param usdc The USDC token address, fourth in the hook's semantic asset order.
    /// @param owner The nonzero hook owner; never inferred from the transaction sender.
    /// @param salt A salt mined for this deployer and the exact hook init code and arguments.
    constructor(
        IPoolManager poolManager,
        MarketClock clock,
        address[3] memory stocks,
        address usdc,
        address owner,
        bytes32 salt
    ) {
        if (owner == address(0)) revert InvalidOwner();
        address[4] memory assets = [stocks[0], stocks[1], stocks[2], usdc];
        address deployedHook;
        {
            bytes memory initCode = abi.encodePacked(
                type(BasketHook).creationCode, abi.encode(poolManager, clock, assets, owner)
            );
            (bool success, bytes memory returnData) = CREATE2_DEPLOYER.call(abi.encodePacked(salt, initCode));
            if (!success || returnData.length != 20) revert HookDeploymentFailed();
            // Arachnid returns a packed 20-byte address, not an ABI-encoded 32-byte word.
            deployedHook = address(bytes20(returnData));
            address expectedHook = address(uint160(uint256(keccak256(abi.encodePacked(
                bytes1(0xff), CREATE2_DEPLOYER, salt, keccak256(initCode)
            )))));
            if (deployedHook != expectedHook) revert HookAddressMismatch(deployedHook, expectedHook);
        }
        if ((uint160(deployedHook) & Hooks.ALL_HOOK_MASK) != FLAGS) revert WrongHookFlags(deployedHook);
        hook = deployedHook;

        for (uint256 i; i < 4; ++i) {
            for (uint256 j = i + 1; j < 4; ++j) {
                poolManager.initialize(BasketHook(deployedHook).poolKey(assets[i], assets[j]), SQRT_PRICE_1_1);
            }
        }
        emit Bootstrapped(deployedHook, salt);
    }
}
