// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";

/// @title BasketRouter
/// @notice Minimal exact-input router for the basket's v4 pools, used by the app. Any v4 router works too: the
/// pricing lives in the hook, not here.
contract BasketRouter is IUnlockCallback {
    using SafeTransferLib for ERC20;

    IPoolManager public immutable poolManager;

    event Routed(address indexed trader, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);

    error NotPoolManager();
    error Slippage();

    constructor(IPoolManager poolManager_) {
        poolManager = poolManager_;
    }

    function swapExactIn(PoolKey calldata key, bool zeroForOne, uint256 amountIn, uint256 minAmountOut, address to)
        external
        returns (uint256 amountOut)
    {
        amountOut = abi.decode(
            poolManager.unlock(abi.encode(msg.sender, key, zeroForOne, amountIn, minAmountOut, to)), (uint256)
        );
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (address payer, PoolKey memory key, bool zeroForOne, uint256 amountIn, uint256 minAmountOut, address to) =
            abi.decode(data, (address, PoolKey, bool, uint256, uint256, address));

        BalanceDelta delta = poolManager.swap(
            key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: -int256(amountIn),
                sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );

        (Currency cIn, Currency cOut) = zeroForOne ? (key.currency0, key.currency1) : (key.currency1, key.currency0);
        uint256 paid = uint256(int256(-(zeroForOne ? delta.amount0() : delta.amount1())));
        uint256 amountOut = uint256(int256(zeroForOne ? delta.amount1() : delta.amount0()));
        if (amountOut < minAmountOut) revert Slippage();

        poolManager.sync(cIn);
        ERC20(Currency.unwrap(cIn)).safeTransferFrom(payer, address(poolManager), paid);
        poolManager.settle();
        poolManager.take(cOut, to, amountOut);

        emit Routed(payer, Currency.unwrap(cIn), Currency.unwrap(cOut), paid, amountOut);
        return abi.encode(amountOut);
    }
}
