// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, toBeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {MarketClock} from "./MarketClock.sol";

/// @title Tiffin Fi's shared-reserve basket and BSKT share token
/// @notice Six pairwise constant-product markets backed by the same four ERC-6909 claim balances.
/// @dev Invariants: redeemable reserve = manager claims minus segregated protocol fees; no plain LP
/// positions; every unlock settles all currency deltas; deposits mint only after exact settlement.
/// Proportional entry/exit rounds in the fund's favour. Single-asset flows require fresh references
/// and are capped at 30% of one reserve. Equal weights describe the curve, not a guaranteed allocation.
/// Trust: the immutable manager and standard, non-rebasing/non-taxed ERC20 assets must be honest;
/// stock issuers, CRE forwarders and the clock owner control reference prices. Basket owner seeds
/// the fund, sets bounded fees/freshness, and withdraws only segregated protocol fees. Stale swaps
/// remain enabled with higher fees, and stale NAV/fee-USD counters are indicative, not a fresh oracle.
/// The 80% edge levy applies only when fresh and is capped at 10% of gross output; it does not
/// guarantee capture of 80% of every opening gap or make every split trade economically identical.
contract BasketHook is ERC20, Ownable, ReentrancyGuard, IHooks, IUnlockCallback {
    using SafeERC20 for IERC20;
    using CurrencyLibrary for Currency;

    error OnlyPoolManager();
    error InvalidAsset();
    error InvalidConfiguration();
    error InvalidPool();
    error HookNotImplemented();
    error PlainLiquidityDisabled();
    error ExactOutputNotSupported();
    error InvalidAmount();
    error EmptyReserve();
    error StalePrices();
    error SeedOwnerOnly();
    error UnbalancedSeed();
    error Slippage();
    error ExceedsSingleAssetCap();
    error SettlementMismatch();
    error UnexpectedCallback();

    uint256 private constant WAD = 1e18;
    uint256 private constant BPS = 10_000;
    uint256 public constant GAP_SHARE_BPS = 8000;
    uint256 public constant GAP_CAP_BPS = 1000;
    uint256 public constant SINGLE_ASSET_CAP_BPS = 3000;
    IPoolManager public immutable poolManager;
    MarketClock public immutable clock;
    address[4] private _assets;
    uint8[4] public assetDecimals;
    uint256[4] private _units;
    uint256[4] private _protocolFees;
    mapping(address => uint256) private _indexPlusOne;
    bool private _unlockActive;

    uint16 public openFeeBps = 30;
    uint16 public closedFeeBps = 60;
    uint16 public staleFeeBps = 200;
    uint16 public protocolShareBps = 1000;
    uint256 public maxPriceAge = 6 hours;
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
        uint256 gapFee;
        bool fresh;
    }

    struct Reference {
        uint256[4] prices;
        bool fresh;
        bool open;
    }

    event Swap(address indexed assetIn, address indexed assetOut, uint256 amountIn, uint256 amountOut,
        uint256 feeOut, uint256 protocolFee, uint256 edgeUsd, uint256 gapFee);
    event Joined(address indexed account, uint256 shares, uint256[4] amounts);
    event Exited(address indexed account, uint256 shares, uint256[4] amounts);
    event ProtocolFeesCollected(address indexed to, uint256[4] amounts);
    event FeesSet(uint16 openBps, uint16 closedBps, uint16 staleBps, uint16 protocolShareBps);
    event MaxPriceAgeSet(uint256 maxPriceAge);

    constructor(IPoolManager pm, MarketClock clock_, address[4] memory assets_, address owner_)
        ERC20("Tiffin Fi Basket", "BSKT") Ownable(owner_)
    {
        if (address(pm) == address(0) || address(clock_) == address(0)) revert InvalidConfiguration();
        poolManager = pm;
        clock = clock_;
        _assets = assets_;
        for (uint256 i; i < 4; ++i) {
            address asset = assets_[i];
            if (asset == address(0) || _indexPlusOne[asset] != 0) revert InvalidAsset();
            _indexPlusOne[asset] = i + 1;
            uint8 d = IERC20Metadata(asset).decimals();
            // Units are used in USD18 valuation; the product's stocks are 18-decimal tokens.
            if ((i < 3 && d != 18) || (i == 3 && d != 6)) revert InvalidConfiguration();
            assetDecimals[i] = d;
            _units[i] = 10 ** uint256(d);
        }
        Hooks.Permissions memory permissions;
        permissions.beforeInitialize = true;
        permissions.beforeAddLiquidity = true;
        permissions.beforeSwap = true;
        permissions.beforeSwapReturnDelta = true;
        Hooks.validateHookPermissions(IHooks(address(this)), permissions);
    }

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
        _;
    }

    function assets() external view returns (address[4] memory) { return _assets; }
    function protocolFees() external view returns (uint256[4] memory) { return _protocolFees; }

    function _index(address asset) private view returns (uint256) {
        uint256 n = _indexPlusOne[asset];
        if (n == 0) revert InvalidAsset();
        return n - 1;
    }

    function _reserve(uint256 i) private view returns (uint256) {
        return poolManager.balanceOf(address(this), Currency.wrap(_assets[i]).toId()) - _protocolFees[i];
    }

    function reserves() public view returns (uint256[4] memory balances) {
        for (uint256 i; i < 4; ++i) balances[i] = _reserve(i);
    }

    function _reference() private view returns (Reference memory ref) {
        (uint256[3] memory prices, uint256[3] memory times, bool open,) = clock.state();
        ref.fresh = true;
        ref.open = open;
        for (uint256 i; i < 3; ++i) {
            ref.prices[i] = prices[i];
            if (prices[i] == 0 || times[i] > block.timestamp || block.timestamp - times[i] > maxPriceAge) {
                ref.fresh = false;
            }
        }
        ref.prices[3] = WAD;
    }

    function _value(uint256 i, uint256 amount, Reference memory ref) private view returns (uint256) {
        return Math.mulDiv(amount, ref.prices[i], _units[i]);
    }

    function _nav(Reference memory ref) private view returns (uint256 nav) {
        for (uint256 i; i < 4; ++i) nav += _value(i, _reserve(i), ref);
    }

    function navUsd() public view returns (uint256 nav, bool fresh) {
        Reference memory ref = _reference();
        return (_nav(ref), ref.fresh);
    }

    function sharePriceUsd() external view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return WAD;
        (uint256 nav,) = navUsd();
        return Math.mulDiv(nav, WAD, supply);
    }

    /// @notice Marginal reserve ratio against USDC, independent of the reference price.
    function poolPriceUsd(address asset) external view returns (uint256) {
        uint256 i = _index(asset);
        if (i == 3) return WAD;
        uint256 b = _reserve(i);
        if (b == 0) revert EmptyReserve();
        return Math.mulDiv(_reserve(3), _units[i] * (WAD / _units[3]), b);
    }

    function _postedBps(Reference memory ref) private view returns (uint256) {
        return !ref.fresh ? staleFeeBps : (ref.open ? openFeeBps : closedFeeBps);
    }

    function postedFeeBps() external view returns (uint256) { return _postedBps(_reference()); }

    function poolKey(address a, address b) public view returns (PoolKey memory) {
        _index(a);
        _index(b);
        if (a == b) revert InvalidAsset();
        (address c0, address c1) = a < b ? (a, b) : (b, a);
        return PoolKey(Currency.wrap(c0), Currency.wrap(c1), 0, 60, IHooks(address(this)));
    }

    function _validatePool(PoolKey calldata key) private view {
        if (address(key.hooks) != address(this) || key.fee != 0 || key.tickSpacing != 60
            || Currency.unwrap(key.currency0) >= Currency.unwrap(key.currency1)) revert InvalidPool();
        _index(Currency.unwrap(key.currency0));
        _index(Currency.unwrap(key.currency1));
    }

    function beforeInitialize(address, PoolKey calldata key, uint160)
        external view override onlyPoolManager returns (bytes4)
    {
        _validatePool(key);
        return IHooks.beforeInitialize.selector;
    }

    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external view override onlyPoolManager returns (bytes4)
    { revert PlainLiquidityDisabled(); }

    /// @notice Quotes exactly the custom curve and output fee used by beforeSwap.
    function quote(address assetIn, address assetOut, uint256 amountIn) external view returns (Quote memory) {
        uint256 i = _index(assetIn);
        uint256 o = _index(assetOut);
        if (i == o) revert InvalidAsset();
        return _quote(i, o, amountIn);
    }

    function _quote(uint256 i, uint256 o, uint256 amountIn) internal view returns (Quote memory q) {
        if (amountIn == 0) revert InvalidAmount();
        // Both custom-accounting deltas must fit in v4's signed 128-bit amounts.
        SafeCast.toInt128(SafeCast.toInt256(amountIn));
        uint256 bIn = _reserve(i);
        uint256 bOut = _reserve(o);
        if (bIn == 0 || bOut == 0) revert EmptyReserve();
        uint256 grossOut = Math.mulDiv(bOut, amountIn, bIn + amountIn);
        Reference memory ref = _reference();
        q.fresh = ref.fresh;
        uint256 postedFee = Math.mulDiv(grossOut, _postedBps(ref), BPS);
        if (ref.fresh) {
            uint256 inUsd = _value(i, amountIn, ref);
            uint256 outUsd = _value(o, grossOut, ref);
            if (outUsd > inUsd) q.edgeUsd = outUsd - inUsd;
            uint256 gapUsd = Math.mulDiv(q.edgeUsd, GAP_SHARE_BPS, BPS);
            q.gapFee = Math.min(Math.mulDiv(gapUsd, _units[o], ref.prices[o]),
                Math.mulDiv(grossOut, GAP_CAP_BPS, BPS));
        }
        if (q.gapFee > postedFee) {
            q.feeOut = q.gapFee;
        } else {
            q.feeOut = postedFee;
            q.protocolFee = Math.mulDiv(postedFee, protocolShareBps, BPS);
        }
        q.amountOut = grossOut - q.feeOut;
        SafeCast.toInt128(SafeCast.toInt256(q.amountOut));
        q.feeUsd = _value(o, q.feeOut, ref);
    }

    function beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        external override onlyPoolManager nonReentrant returns (bytes4, BeforeSwapDelta, uint24)
    {
        _validatePool(key);
        if (params.amountSpecified >= 0) revert ExactOutputNotSupported();
        // Reject int256.min without negating it, and constrain to the v4 signed-delta range.
        if (params.amountSpecified < -int256(type(int128).max)) revert InvalidAmount();
        uint256 amountIn = uint256(-params.amountSpecified);
        address assetIn = Currency.unwrap(params.zeroForOne ? key.currency0 : key.currency1);
        address assetOut = Currency.unwrap(params.zeroForOne ? key.currency1 : key.currency0);
        uint256 amountOut = _executeSwap(assetIn, assetOut, amountIn);
        return (IHooks.beforeSwap.selector,
            toBeforeSwapDelta(SafeCast.toInt128(SafeCast.toInt256(amountIn)),
                -SafeCast.toInt128(SafeCast.toInt256(amountOut))), 0);
    }

    function _executeSwap(address assetIn, address assetOut, uint256 amountIn) private returns (uint256) {
        uint256 o = _index(assetOut);
        Quote memory q = _quote(_index(assetIn), o, amountIn);
        poolManager.mint(address(this), Currency.wrap(assetIn).toId(), amountIn);
        poolManager.burn(address(this), Currency.wrap(assetOut).toId(), q.amountOut);
        _recordSwap(o, q);
        emit Swap(assetIn, assetOut, amountIn, q.amountOut, q.feeOut, q.protocolFee, q.edgeUsd, q.gapFee);
        return q.amountOut;
    }

    function _recordSwap(uint256 o, Quote memory q) private {
        Reference memory ref = _reference();
        _protocolFees[o] += q.protocolFee;
        totalFeesUsd += q.feeUsd;
        // A tie is posted binding, even when its protocol share rounds down to zero.
        if (q.gapFee > Math.mulDiv(q.amountOut + q.feeOut, _postedBps(ref), BPS)) {
            gapCapturedUsd += q.feeUsd;
        }
        protocolEarnedUsd += _value(o, q.protocolFee, ref);
        ++swapCount;
    }

    /// @notice Proportional subscription; initial equal-dollar seed is restricted to the owner.
    function join(uint256[4] calldata maxAmountsIn, uint256 minShares)
        external nonReentrant returns (uint256 shares)
    {
        uint256[4] memory amounts;
        uint256 supply = totalSupply();
        if (supply == 0) {
            if (msg.sender != owner()) revert SeedOwnerOnly();
            Reference memory ref = _reference();
            if (!ref.fresh) revert StalePrices();
            uint256 usd = _value(3, maxAmountsIn[3], ref);
            if (usd == 0) revert InvalidAmount();
            for (uint256 i; i < 4; ++i) {
                if (maxAmountsIn[i] == 0) revert InvalidAmount();
                amounts[i] = maxAmountsIn[i];
                uint256 v = _value(i, amounts[i], ref);
                uint256 diff = v > usd ? v - usd : usd - v;
                if (diff > usd / 100) revert UnbalancedSeed();
            }
            shares = maxAmountsIn[3] * 4 * 1e12;
        } else {
            uint256[4] memory balances = reserves();
            shares = type(uint256).max;
            for (uint256 i; i < 4; ++i) {
                if (balances[i] == 0) revert EmptyReserve();
                shares = Math.min(shares, Math.mulDiv(maxAmountsIn[i], supply, balances[i]));
            }
            for (uint256 i; i < 4; ++i) {
                amounts[i] = Math.mulDiv(shares, balances[i], supply, Math.Rounding.Ceil);
                if (amounts[i] > maxAmountsIn[i]) revert Slippage();
            }
        }
        _checkShares(shares, minShares);
        _move(true, msg.sender, amounts);
        _mint(msg.sender, shares);
        emit Joined(msg.sender, shares, amounts);
    }

    /// @notice Proportional redemption remains available even with stale reference prices.
    function exit(uint256 shares, uint256[4] calldata minAmountsOut)
        external nonReentrant returns (uint256[4] memory amounts)
    {
        uint256 supply = totalSupply();
        _checkBurn(shares, supply);
        for (uint256 i; i < 4; ++i) {
            amounts[i] = Math.mulDiv(_reserve(i), shares, supply);
            if (amounts[i] < minAmountsOut[i]) revert Slippage();
        }
        _burn(msg.sender, shares);
        _move(false, msg.sender, amounts);
        emit Exited(msg.sender, shares, amounts);
    }

    /// @notice Fresh-price single-asset subscription, using two fixed-point square roots.
    function joinSingle(address asset, uint256 amountIn, uint256 minShares)
        external nonReentrant returns (uint256 shares)
    {
        uint256 i = _index(asset);
        Reference memory ref = _reference();
        if (!ref.fresh) revert StalePrices();
        uint256 supply = totalSupply();
        uint256 b = _reserve(i);
        if (supply == 0 || b == 0 || amountIn == 0) revert InvalidAmount();
        if (amountIn > Math.mulDiv(b, SINGLE_ASSET_CAP_BPS, BPS)) revert ExceedsSingleAssetCap();
        uint256 effIn = amountIn - Math.mulDiv(amountIn, _postedBps(ref) * 3, 40_000);
        uint256 x = Math.mulDiv(b + effIn, WAD, b);
        uint256 root4 = _sqrtWad(_sqrtWad(x));
        shares = Math.mulDiv(supply, root4 - WAD, WAD);
        shares = Math.min(shares, Math.mulDiv(_value(i, amountIn, ref), supply, _nav(ref)));
        _checkShares(shares, minShares);
        uint256[4] memory amounts;
        amounts[i] = amountIn;
        _move(true, msg.sender, amounts);
        _mint(msg.sender, shares);
        emit Joined(msg.sender, shares, amounts);
    }

    /// @notice Fresh-price single-asset redemption; the NAV cap protects other holders.
    /// @dev Balancer inverse, capped at the shares' reference value and at 30% of the reserve, then charged
    /// three quarters of the posted fee out of the payout, mirroring joinSingle. The fee stays in the fund
    /// (no protocol cut). The reference-value cap stops it being used to dodge the gap fee.
    function exitSingle(address asset, uint256 shares, uint256 minOut)
        external nonReentrant returns (uint256 out)
    {
        uint256 i = _index(asset);
        Reference memory ref = _reference();
        if (!ref.fresh) revert StalePrices();
        uint256 supply = totalSupply();
        _checkBurn(shares, supply);
        uint256 b = _reserve(i);
        if (b == 0) revert EmptyReserve();
        uint256 r = Math.mulDiv(supply - shares, WAD, supply);
        uint256 r2 = Math.mulDiv(r, r, WAD);
        uint256 r4 = Math.mulDiv(r2, r2, WAD);
        out = Math.mulDiv(b, WAD - r4, WAD);
        uint256 usd = Math.mulDiv(shares, _nav(ref), supply);
        out = Math.min(out, Math.mulDiv(usd, _units[i], ref.prices[i]));
        if (out > Math.mulDiv(b, SINGLE_ASSET_CAP_BPS, BPS)) revert ExceedsSingleAssetCap();
        // Three quarters of the posted fee comes out of the payout and stays in the fund (rounded up).
        out -= Math.mulDiv(out, _postedBps(ref) * 3, 40_000, Math.Rounding.Ceil);
        if (out == 0) revert InvalidAmount();
        if (out < minOut) revert Slippage();
        uint256[4] memory amounts;
        amounts[i] = out;
        _burn(msg.sender, shares);
        _move(false, msg.sender, amounts);
        emit Exited(msg.sender, shares, amounts);
    }

    function _sqrtWad(uint256 v) private pure returns (uint256) { return Math.sqrt(v * WAD); }

    function _checkShares(uint256 shares, uint256 minShares) private pure {
        if (shares == 0) revert InvalidAmount();
        if (shares < minShares) revert Slippage();
    }

    function _checkBurn(uint256 shares, uint256 supply) private view {
        if (shares == 0 || shares > supply || shares > balanceOf(msg.sender)) revert InvalidAmount();
    }

    /// @notice Withdraw only protocol-owned claims, never shareholder reserves.
    function collectProtocolFees(address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert InvalidAsset();
        uint256[4] memory amounts = _protocolFees;
        delete _protocolFees;
        _move(false, to, amounts);
        emit ProtocolFeesCollected(to, amounts);
    }

    function _move(bool deposit, address account, uint256[4] memory amounts) private {
        _unlockActive = true;
        poolManager.unlock(abi.encode(deposit, account, amounts));
        _unlockActive = false;
    }

    /// @inheritdoc IUnlockCallback
    function unlockCallback(bytes calldata data) external override onlyPoolManager returns (bytes memory) {
        if (!_unlockActive) revert UnexpectedCallback();
        // Consume the callback authorization before any token call.
        _unlockActive = false;
        (bool deposit, address account, uint256[4] memory amounts) =
            abi.decode(data, (bool, address, uint256[4]));
        for (uint256 i; i < 4; ++i) {
            uint256 amount = amounts[i];
            if (amount == 0) continue;
            Currency currency = Currency.wrap(_assets[i]);
            if (deposit) {
                poolManager.sync(currency);
                IERC20(_assets[i]).safeTransferFrom(account, address(poolManager), amount);
                if (poolManager.settle() != amount) revert SettlementMismatch();
                poolManager.mint(address(this), currency.toId(), amount);
            } else {
                poolManager.burn(address(this), currency.toId(), amount);
                poolManager.take(currency, account, amount);
            }
        }
        return bytes("");
    }

    function setFees(uint16 openBps, uint16 closedBps, uint16 staleBps, uint16 shareBps) external onlyOwner {
        if (openBps == 0 || openBps > closedBps || closedBps > staleBps || staleBps > 1000
            || shareBps > 2000) revert InvalidConfiguration();
        openFeeBps = openBps;
        closedFeeBps = closedBps;
        staleFeeBps = staleBps;
        protocolShareBps = shareBps;
        emit FeesSet(openBps, closedBps, staleBps, shareBps);
    }

    function setMaxPriceAge(uint256 age) external onlyOwner {
        if (age < 5 minutes || age > 3 days) revert InvalidConfiguration();
        maxPriceAge = age;
        emit MaxPriceAgeSet(age);
    }

    // Disabled callbacks still enforce the manager trust boundary when called directly.
    function afterInitialize(address, PoolKey calldata, uint160, int24)
        external view override onlyPoolManager returns (bytes4) { revert HookNotImplemented(); }
    function afterAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata,
        BalanceDelta, BalanceDelta, bytes calldata)
        external view override onlyPoolManager returns (bytes4, BalanceDelta) { revert HookNotImplemented(); }
    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external view override onlyPoolManager returns (bytes4) { revert HookNotImplemented(); }
    function afterRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata,
        BalanceDelta, BalanceDelta, bytes calldata)
        external view override onlyPoolManager returns (bytes4, BalanceDelta) { revert HookNotImplemented(); }
    function afterSwap(address, PoolKey calldata, SwapParams calldata, BalanceDelta, bytes calldata)
        external view override onlyPoolManager returns (bytes4, int128) { revert HookNotImplemented(); }
    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external view override onlyPoolManager returns (bytes4) { revert HookNotImplemented(); }
    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external view override onlyPoolManager returns (bytes4) { revert HookNotImplemented(); }
}
