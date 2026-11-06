// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, toBeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";
import {FixedPointMathLib} from "solmate/src/utils/FixedPointMathLib.sol";
import {MarketClock} from "./MarketClock.sol";

/// @title BasketHook
/// @notice One Uniswap v4 hook that turns six pools into one stock fund, and the fund's share token.
/// Every pair among NVDA, AAPL, MSFT and USDC is a v4 pool pointing at this hook. The hook is the curve:
/// beforeSwap takes the whole input and pays the whole output through a BeforeSwapDelta, so v4's own
/// concentrated-liquidity maths swaps nothing. Prices come from Balancer's weighted formula over one shared
/// reserve held as ERC-6909 claims in the PoolManager. Weights are equal (25% each), so a pair swap is exact
/// x*y=k on the two balances and needs no fractional powers.
///
/// Fees: each swap pays the larger of
///  - the posted fee: 0.30% while Wall Street is open, 0.60% while it is closed, 2% if prices are stale.
///    90% stays in the fund, 10% goes to the protocol.
///  - the gap fee: 80% of the trade's edge, meaning what the trader receives valued at the reference price
///    minus what they paid. All of it stays in the fund. The trader (usually a bot closing Monday's gap)
///    keeps 20%, so closing the whole gap is still its best trade.
/// Fees stay in the reserve, so each share redeems for more over time.
contract BasketHook is IHooks, IUnlockCallback, ERC20 {
    using FixedPointMathLib for uint256;
    using SafeTransferLib for ERC20;

    uint256 public constant N = 4;
    uint8 public constant USDC = 3;
    int24 public constant TICK_SPACING = 60;
    uint160 public constant FLAGS = uint160(
        Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG
            | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG
    );
    uint256 internal constant BPS = 10_000;
    uint256 internal constant WAD = 1e18;
    /// @dev Balancer's cap on single-asset joins and exits: 30% of that asset's balance.
    uint256 internal constant MAX_SINGLE_RATIO = 0.3e18;

    IPoolManager public immutable poolManager;
    MarketClock public immutable clock;
    address public owner;

    Currency[N] internal _assets; // 0 NVDA, 1 AAPL, 2 MSFT, 3 USDC
    uint8[N] internal _decimals;
    uint256[N] internal _reserves; // the fund's balances, held as ERC-6909 claims
    uint256[N] internal _protocolFees; // the protocol's share, also held as claims

    uint16 public feeOpenBps = 30;
    uint16 public feeClosedBps = 60;
    uint16 public feeStaleBps = 200;
    uint16 public gapShareBps = 8_000;
    uint16 public gapCapBps = 1_000;
    uint16 public protocolShareBps = 1_000;
    uint32 public maxPriceAge = 6 hours;

    // Running totals in USD (18 decimals), for the app.
    uint256 public totalFeesUsd;
    uint256 public gapCapturedUsd;
    uint256 public protocolEarnedUsd;
    uint256 public swapCount;

    struct Quote {
        uint256 amountOut;
        uint256 feeOut;
        uint256 protocolFee;
        uint256 feeUsd;
        uint256 edgeUsd;
        bool gapFee;
        bool fresh;
    }

    enum Action {
        Join,
        Exit,
        JoinSingle,
        ExitSingle,
        Collect
    }

    event Swapped(
        address indexed router,
        uint8 indexed assetIn,
        uint8 indexed assetOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 feeUsd,
        uint256 edgeUsd,
        bool gapFee
    );
    event Joined(address indexed user, uint256 shares, uint256[N] amountsIn);
    event Exited(address indexed user, uint256 shares, uint256[N] amountsOut);
    event FeesSet(uint16 open, uint16 closed, uint16 stale, uint16 gapShare, uint16 gapCap, uint16 protocolShare);
    event ProtocolFeesCollected(address indexed to, uint256[N] amounts);

    error NotPoolManager();
    error NotOwner();
    error HookNotImplemented();
    error UseJoin();
    error BadPool();
    error UnknownAsset();
    error ExactOutputNotSupported();
    error EmptyFund();
    error ZeroAmount();
    error Slippage();
    error TooLarge();
    error BadFee();

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(
        IPoolManager poolManager_,
        MarketClock clock_,
        Currency[3] memory stocks_,
        Currency usdc_,
        address owner_
    ) ERC20("Stock Basket", "BSKT", 18) {
        poolManager = poolManager_;
        clock = clock_;
        owner = owner_;
        for (uint256 i; i < 3; ++i) {
            _assets[i] = stocks_[i];
        }
        _assets[USDC] = usdc_;
        for (uint256 i; i < N; ++i) {
            _decimals[i] = ERC20(Currency.unwrap(_assets[i])).decimals();
        }
        Hooks.validateHookPermissions(IHooks(address(this)), getHookPermissions());
    }

    function getHookPermissions() public pure returns (Hooks.Permissions memory p) {
        p.beforeInitialize = true;
        p.beforeAddLiquidity = true;
        p.beforeSwap = true;
        p.beforeSwapReturnDelta = true;
    }

    // ------------------------------------------------------------------
    // Hook callbacks
    // ------------------------------------------------------------------

    /// @notice Only pools between two basket assets, with fee 0 (the hook charges its own fee).
    function beforeInitialize(address, PoolKey calldata key, uint160) external view onlyPoolManager returns (bytes4) {
        if (key.fee != 0 || key.tickSpacing != TICK_SPACING) revert BadPool();
        if (indexOf(key.currency0) == indexOf(key.currency1)) revert BadPool();
        return IHooks.beforeInitialize.selector;
    }

    /// @notice Plain concentrated-liquidity positions are blocked: you join the fund through the hook.
    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert UseJoin();
    }

    /// @notice The custom curve. Takes the input as claims, pays the output from claims, and returns a delta that
    /// leaves nothing for v4's own curve to swap.
    function beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        if (params.amountSpecified >= 0) revert ExactOutputNotSupported();
        uint256 amountIn = uint256(-params.amountSpecified);
        if (amountIn > uint128(type(int128).max)) revert TooLarge();
        (Currency cIn, Currency cOut) =
            params.zeroForOne ? (key.currency0, key.currency1) : (key.currency1, key.currency0);
        uint256 i = indexOf(cIn);
        uint256 o = indexOf(cOut);

        Quote memory q = _quote(i, o, amountIn);
        if (q.amountOut == 0) revert ZeroAmount();

        _reserves[i] += amountIn;
        _reserves[o] -= q.amountOut + q.protocolFee;
        _protocolFees[o] += q.protocolFee;
        totalFeesUsd += q.feeUsd;
        if (q.gapFee) gapCapturedUsd += q.feeUsd;
        else protocolEarnedUsd += q.feeUsd * protocolShareBps / BPS;
        ++swapCount;
        emit Swapped(sender, uint8(i), uint8(o), amountIn, q.amountOut, q.feeUsd, q.edgeUsd, q.gapFee);

        poolManager.mint(address(this), cIn.toId(), amountIn);
        poolManager.burn(address(this), cOut.toId(), q.amountOut);
        return (
            IHooks.beforeSwap.selector,
            toBeforeSwapDelta(int128(int256(amountIn)), -int128(int256(q.amountOut))),
            0
        );
    }

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function afterSwap(address, PoolKey calldata, SwapParams calldata, BalanceDelta, bytes calldata)
        external
        pure
        returns (bytes4, int128)
    {
        revert HookNotImplemented();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    // ------------------------------------------------------------------
    // Joining and leaving the fund
    // ------------------------------------------------------------------

    /// @notice Deposit all four assets in the fund's current ratio. The first join sets the share price to about $1.
    function join(uint256[N] calldata maxAmountsIn, uint256 minShares) external returns (uint256 shares) {
        shares = abi.decode(_unlock(Action.Join, abi.encode(maxAmountsIn, minShares)), (uint256));
    }

    /// @notice Redeem shares for a slice of every asset.
    function exit(uint256 shares, uint256[N] calldata minAmountsOut) external returns (uint256[N] memory amountsOut) {
        amountsOut = abi.decode(_unlock(Action.Exit, abi.encode(shares, minAmountsOut)), (uint256[4]));
    }

    /// @notice Buy shares with one asset, usually USDC. Priced with Balancer's single-asset join, and never above
    /// the reference-price value, so a stale pool can't be bought cheaply this way either.
    function joinSingle(uint8 asset, uint256 amountIn, uint256 minShares) external returns (uint256 shares) {
        shares = abi.decode(_unlock(Action.JoinSingle, abi.encode(asset, amountIn, minShares)), (uint256));
    }

    /// @notice Sell shares for one asset, usually USDC. Balancer's single-asset exit, capped at reference value.
    function exitSingle(uint8 asset, uint256 shares, uint256 minAmountOut) external returns (uint256 amountOut) {
        amountOut = abi.decode(_unlock(Action.ExitSingle, abi.encode(asset, shares, minAmountOut)), (uint256));
    }

    function collectProtocolFees(address to) external onlyOwner returns (uint256[N] memory amounts) {
        amounts = abi.decode(_unlock(Action.Collect, abi.encode(to)), (uint256[4]));
    }

    function unlockCallback(bytes calldata data) external onlyPoolManager returns (bytes memory) {
        (Action action, address user, bytes memory args) = abi.decode(data, (Action, address, bytes));
        if (action == Action.Join) return abi.encode(_join(user, args));
        if (action == Action.Exit) return abi.encode(_exit(user, args));
        if (action == Action.JoinSingle) return abi.encode(_joinSingle(user, args));
        if (action == Action.ExitSingle) return abi.encode(_exitSingle(user, args));
        return abi.encode(_collect(args));
    }

    function _unlock(Action action, bytes memory args) internal returns (bytes memory) {
        return poolManager.unlock(abi.encode(action, msg.sender, args));
    }

    function _join(address user, bytes memory args) internal returns (uint256 shares) {
        (uint256[N] memory maxIn, uint256 minShares) = abi.decode(args, (uint256[4], uint256));
        uint256 supply = totalSupply;
        uint256[N] memory amountsIn;
        if (supply == 0) {
            for (uint256 i; i < N; ++i) {
                if (maxIn[i] == 0) revert ZeroAmount();
                amountsIn[i] = maxIn[i];
            }
            // USDC is a quarter of the fund, so the first share is worth about $1.
            shares = maxIn[USDC] * 4 * 10 ** (18 - _decimals[USDC]);
        } else {
            uint256 ratio = type(uint256).max;
            for (uint256 i; i < N; ++i) {
                uint256 r = maxIn[i].mulDivDown(WAD, _reserves[i]);
                if (r < ratio) ratio = r;
            }
            shares = supply.mulDivDown(ratio, WAD);
            for (uint256 i; i < N; ++i) {
                amountsIn[i] = _reserves[i].mulDivUp(shares, supply);
            }
        }
        if (shares == 0 || shares < minShares) revert Slippage();
        for (uint256 i; i < N; ++i) {
            _pull(i, user, amountsIn[i]);
            _reserves[i] += amountsIn[i];
        }
        _mint(user, shares);
        emit Joined(user, shares, amountsIn);
    }

    function _exit(address user, bytes memory args) internal returns (uint256[N] memory out) {
        (uint256 shares, uint256[N] memory minOut) = abi.decode(args, (uint256, uint256[4]));
        if (shares == 0) revert ZeroAmount();
        uint256 supply = totalSupply;
        for (uint256 i; i < N; ++i) {
            out[i] = _reserves[i].mulDivDown(shares, supply);
            if (out[i] < minOut[i]) revert Slippage();
        }
        _burn(user, shares);
        for (uint256 i; i < N; ++i) {
            _reserves[i] -= out[i];
            _push(i, user, out[i]);
        }
        emit Exited(user, shares, out);
    }

    function _joinSingle(address user, bytes memory args) internal returns (uint256 shares) {
        (uint8 i, uint256 amountIn, uint256 minShares) = abi.decode(args, (uint8, uint256, uint256));
        if (i >= N) revert UnknownAsset();
        if (amountIn == 0) revert ZeroAmount();
        uint256 supply = totalSupply;
        uint256 b = _reserves[i];
        if (supply == 0) revert EmptyFund();
        if (amountIn > b.mulDivDown(MAX_SINGLE_RATIO, WAD)) revert TooLarge();

        (uint256 nav, bool fresh) = navUsd();
        // Three quarters of a single-asset join is an implicit swap into the other assets, so it pays the posted fee.
        uint256 effIn = amountIn - amountIn.mulDivUp(3 * _postedFeeBps(fresh), 4 * BPS);
        // Balancer: shares = supply * ((1 + effIn / b) ^ (1/4) - 1)
        shares = supply.mulDivDown(_fourthRoot((b + effIn).mulDivDown(WAD, b)) - WAD, WAD);
        if (fresh) {
            (uint256 p,) = _price(i);
            uint256 atNav = supply.mulDivDown(_toUsd(i, effIn, p), nav);
            if (atNav < shares) shares = atNav;
        }
        if (shares == 0 || shares < minShares) revert Slippage();

        _pull(i, user, amountIn);
        _reserves[i] += amountIn;
        _mint(user, shares);
        uint256[N] memory amountsIn;
        amountsIn[i] = amountIn;
        emit Joined(user, shares, amountsIn);
    }

    function _exitSingle(address user, bytes memory args) internal returns (uint256 out) {
        (uint8 i, uint256 shares, uint256 minOut) = abi.decode(args, (uint8, uint256, uint256));
        if (i >= N) revert UnknownAsset();
        uint256 supply = totalSupply;
        if (shares == 0 || shares >= supply) revert ZeroAmount();
        uint256 b = _reserves[i];

        (uint256 nav, bool fresh) = navUsd();
        // Balancer: out = b * (1 - ((supply - shares) / supply) ^ 4)
        uint256 r = (supply - shares).mulDivDown(WAD, supply);
        uint256 r2 = r.mulDivUp(r, WAD);
        out = b.mulDivDown(WAD - r2.mulDivUp(r2, WAD), WAD);
        if (fresh) {
            (uint256 p,) = _price(i);
            uint256 atNav = nav.mulDivDown(shares, supply).mulDivDown(10 ** _decimals[i], p);
            if (atNav < out) out = atNav;
        }
        out -= out.mulDivUp(3 * _postedFeeBps(fresh), 4 * BPS);
        if (out > b.mulDivDown(MAX_SINGLE_RATIO, WAD)) revert TooLarge();
        if (out == 0 || out < minOut) revert Slippage();

        _burn(user, shares);
        _reserves[i] -= out;
        _push(i, user, out);
        uint256[N] memory amountsOut;
        amountsOut[i] = out;
        emit Exited(user, shares, amountsOut);
    }

    function _collect(bytes memory args) internal returns (uint256[N] memory amounts) {
        address to = abi.decode(args, (address));
        for (uint256 i; i < N; ++i) {
            amounts[i] = _protocolFees[i];
            _protocolFees[i] = 0;
            _push(i, to, amounts[i]);
        }
        emit ProtocolFeesCollected(to, amounts);
    }

    /// @dev Moves tokens from `from` into the PoolManager and keeps them as the hook's ERC-6909 claims.
    function _pull(uint256 i, address from, uint256 amount) internal {
        if (amount == 0) return;
        Currency c = _assets[i];
        poolManager.sync(c);
        ERC20(Currency.unwrap(c)).safeTransferFrom(from, address(poolManager), amount);
        poolManager.settle();
        poolManager.mint(address(this), c.toId(), amount);
    }

    /// @dev Burns the hook's claims and sends the tokens to `to`.
    function _push(uint256 i, address to, uint256 amount) internal {
        if (amount == 0) return;
        Currency c = _assets[i];
        poolManager.burn(address(this), c.toId(), amount);
        poolManager.take(c, to, amount);
    }

    // ------------------------------------------------------------------
    // Pricing
    // ------------------------------------------------------------------

    function _quote(uint256 i, uint256 o, uint256 amountIn) internal view returns (Quote memory q) {
        uint256 grossOut = _grossOut(i, o, amountIn);
        (uint256 pIn, bool freshIn) = _price(i);
        (uint256 pOut, bool freshOut) = _price(o);
        q.fresh = freshIn && freshOut;
        uint256 postedFee = grossOut.mulDivUp(_postedFeeBps(q.fresh), BPS);
        uint256 gapFee;
        if (q.fresh) (q.edgeUsd, gapFee) = _gapFee(i, o, amountIn, grossOut, pIn, pOut);

        q.gapFee = gapFee > postedFee;
        q.feeOut = q.gapFee ? gapFee : postedFee;
        q.amountOut = grossOut - q.feeOut;
        q.protocolFee = q.gapFee ? 0 : q.feeOut.mulDivDown(protocolShareBps, BPS);
        if (pOut != 0) q.feeUsd = _toUsd(o, q.feeOut, pOut);
    }

    function _grossOut(uint256 i, uint256 o, uint256 amountIn) internal view returns (uint256) {
        uint256 bIn = _reserves[i];
        uint256 bOut = _reserves[o];
        if (bIn == 0 || bOut == 0) revert EmptyFund();
        // Balancer's weighted formula with equal weights is exactly x*y=k on the two balances.
        return bOut.mulDivDown(amountIn, bIn + amountIn);
    }

    /// @dev The trader's edge at reference prices, and the fund's 80% of it in output tokens (capped).
    function _gapFee(uint256 i, uint256 o, uint256 amountIn, uint256 grossOut, uint256 pIn, uint256 pOut)
        internal
        view
        returns (uint256 edgeUsd, uint256 fee)
    {
        uint256 valueIn = _toUsd(i, amountIn, pIn);
        uint256 valueOut = _toUsd(o, grossOut, pOut);
        if (valueOut <= valueIn) return (0, 0);
        edgeUsd = valueOut - valueIn;
        fee = edgeUsd.mulDivUp(gapShareBps, BPS).mulDivUp(10 ** _decimals[o], pOut);
        uint256 cap = grossOut.mulDivDown(gapCapBps, BPS);
        if (fee > cap) fee = cap;
    }

    function _postedFeeBps(bool fresh) internal view returns (uint256) {
        if (!fresh) return feeStaleBps;
        return clock.marketOpen() ? feeOpenBps : feeClosedBps;
    }

    function _price(uint256 i) internal view returns (uint256 price, bool fresh) {
        if (i == USDC) return (WAD, true);
        uint256 updatedAt;
        (price, updatedAt) = clock.priceOf(Currency.unwrap(_assets[i]));
        fresh = price != 0 && block.timestamp <= updatedAt + maxPriceAge;
    }

    function _toUsd(uint256 i, uint256 amount, uint256 price) internal view returns (uint256) {
        return amount.mulDivDown(price, 10 ** _decimals[i]);
    }

    /// @dev Fourth root of an 18-decimal fixed-point number: two square roots.
    function _fourthRoot(uint256 x) internal pure returns (uint256) {
        return FixedPointMathLib.sqrt(FixedPointMathLib.sqrt(x * WAD) * WAD);
    }

    // ------------------------------------------------------------------
    // Views for the app and routers
    // ------------------------------------------------------------------

    function indexOf(Currency c) public view returns (uint256) {
        for (uint256 i; i < N; ++i) {
            if (_assets[i] == c) return i;
        }
        revert UnknownAsset();
    }

    function assets() external view returns (address[N] memory tokens, uint8[N] memory decimals_) {
        for (uint256 i; i < N; ++i) {
            tokens[i] = Currency.unwrap(_assets[i]);
            decimals_[i] = _decimals[i];
        }
    }

    function reserves() external view returns (uint256[N] memory) {
        return _reserves;
    }

    function protocolFees() external view returns (uint256[N] memory) {
        return _protocolFees;
    }

    function quote(uint8 assetIn, uint8 assetOut, uint256 amountIn) external view returns (Quote memory) {
        if (assetIn >= N || assetOut >= N || assetIn == assetOut) revert UnknownAsset();
        return _quote(assetIn, assetOut, amountIn);
    }

    function postedFeeBps() external view returns (uint256) {
        (, bool fresh) = navUsd();
        return _postedFeeBps(fresh);
    }

    /// @notice Fund value at the reference prices, and whether every price is fresh.
    function navUsd() public view returns (uint256 nav, bool fresh) {
        fresh = true;
        for (uint256 i; i < N; ++i) {
            (uint256 p, bool f) = _price(i);
            if (!f) fresh = false;
            nav += _toUsd(i, _reserves[i], p);
        }
    }

    function sharePriceUsd() external view returns (uint256) {
        (uint256 nav,) = navUsd();
        return totalSupply == 0 ? WAD : nav.mulDivDown(WAD, totalSupply);
    }

    /// @notice The pool's own price of `asset` in USDC (18 decimals). With equal weights it is the balance ratio.
    function poolPriceUsd(uint8 asset) external view returns (uint256) {
        if (asset >= N) revert UnknownAsset();
        return (_reserves[USDC] * 10 ** _decimals[asset]).mulDivDown(WAD, _reserves[asset] * 10 ** _decimals[USDC]);
    }

    function poolKey(uint8 a, uint8 b) public view returns (PoolKey memory key) {
        if (a >= N || b >= N || a == b) revert UnknownAsset();
        (Currency c0, Currency c1) = _assets[a] < _assets[b] ? (_assets[a], _assets[b]) : (_assets[b], _assets[a]);
        key = PoolKey({currency0: c0, currency1: c1, fee: 0, tickSpacing: TICK_SPACING, hooks: IHooks(address(this))});
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------

    function setFees(uint16 open, uint16 closed, uint16 stale, uint16 gapShare, uint16 gapCap, uint16 protocolShare)
        external
        onlyOwner
    {
        if (open > 100 || closed > 300 || stale > 500 || gapShare > BPS || gapCap > 2_000 || protocolShare > 5_000) {
            revert BadFee();
        }
        (feeOpenBps, feeClosedBps, feeStaleBps, gapShareBps, gapCapBps, protocolShareBps) =
            (open, closed, stale, gapShare, gapCap, protocolShare);
        emit FeesSet(open, closed, stale, gapShare, gapCap, protocolShare);
    }

    function setMaxPriceAge(uint32 age) external onlyOwner {
        maxPriceAge = age;
    }

    function setOwner(address owner_) external onlyOwner {
        owner = owner_;
    }
}
