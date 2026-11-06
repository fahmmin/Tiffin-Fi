// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

/// @notice ERC20-only exact-input v4 router; users approve this router, not the manager.
/// @dev No custody between transactions. Only an active, self-initiated unlock can spend a payer's
/// allowance. Reverts atomically on slippage, partial input, unexpected delta signs, or taxed input.
contract BasketRouter is IUnlockCallback, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using BalanceDeltaLibrary for BalanceDelta;

    error OnlyPoolManager();
    error InvalidAddress();
    error NativeCurrencyNotSupported();
    error InvalidAmount();
    error InvalidDelta();
    error Slippage();
    error SettlementMismatch();
    error UnexpectedCallback();

    IPoolManager public immutable poolManager;
    bool private _unlockActive;

    struct Request {
        PoolKey key;
        bool zeroForOne;
        uint256 amountIn;
        uint256 minAmountOut;
        address recipient;
        address payer;
    }

    event RoutedSwap(address indexed payer, address indexed recipient, uint256 amountIn, uint256 amountOut);

    constructor(IPoolManager pm) {
        if (address(pm) == address(0)) revert InvalidAddress();
        poolManager = pm;
    }

    /// @notice Spend exactly amountIn from msg.sender and pay output directly to recipient.
    function swapExactInput(PoolKey calldata key, bool zeroForOne, uint256 amountIn,
        uint256 minAmountOut, address recipient) external nonReentrant returns (uint256 amountOut)
    {
        if (Currency.unwrap(key.currency0) == address(0) || Currency.unwrap(key.currency1) == address(0)) {
            revert NativeCurrencyNotSupported();
        }
        if (recipient == address(0)) revert InvalidAddress();
        if (amountIn == 0 || amountIn > uint256(uint128(type(int128).max))) revert InvalidAmount();
        Request memory request = Request(key, zeroForOne, amountIn, minAmountOut, recipient, msg.sender);
        _unlockActive = true;
        amountOut = abi.decode(poolManager.unlock(abi.encode(request)), (uint256));
        _unlockActive = false;
        emit RoutedSwap(msg.sender, recipient, amountIn, amountOut);
    }

    /// @inheritdoc IUnlockCallback
    function unlockCallback(bytes calldata data) external override returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
        if (!_unlockActive) revert UnexpectedCallback();
        _unlockActive = false;
        Request memory request = abi.decode(data, (Request));
        BalanceDelta delta = poolManager.swap(request.key, SwapParams({
            zeroForOne: request.zeroForOne,
            amountSpecified: -int256(request.amountIn),
            sqrtPriceLimitX96: request.zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
        }), bytes(""));
        int128 inputDelta = request.zeroForOne ? delta.amount0() : delta.amount1();
        int128 outputDelta = request.zeroForOne ? delta.amount1() : delta.amount0();
        if (inputDelta >= 0 || outputDelta < 0) revert InvalidDelta();
        uint256 owed = uint256(-int256(inputDelta));
        uint256 amountOut = uint256(int256(outputDelta));
        if (owed != request.amountIn) revert InvalidDelta();
        if (amountOut < request.minAmountOut) revert Slippage();
        Currency input = request.zeroForOne ? request.key.currency0 : request.key.currency1;
        Currency output = request.zeroForOne ? request.key.currency1 : request.key.currency0;
        poolManager.sync(input);
        IERC20(Currency.unwrap(input)).safeTransferFrom(request.payer, address(poolManager), owed);
        if (poolManager.settle() != owed) revert SettlementMismatch();
        if (amountOut != 0) poolManager.take(output, request.recipient, amountOut);
        return abi.encode(amountOut);
    }
}
