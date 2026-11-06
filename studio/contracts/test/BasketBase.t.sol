// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {MockStock} from "../MockStock.sol";
import {MarketClock} from "../MarketClock.sol";
import {BasketHook} from "../BasketHook.sol";
import {BasketRouter} from "../BasketRouter.sol";

/// @dev Independent re-implementation of exitSingle's documented payout: Balancer inverse capped at the
/// shares' reference value (gross), then net = gross - ceil(gross * postedBps * 3 / 40000).
library ExitModel {
    function gross(BasketHook h, MarketClock c, uint256 idx, uint256 shares) internal view returns (uint256 out) {
        out = _balancer(h.reserves()[idx], h.totalSupply(), shares);
        out = Math.min(out, _usdCap(h, c, idx, shares));
    }

    function _balancer(uint256 b, uint256 supply, uint256 shares) private pure returns (uint256) {
        uint256 r = Math.mulDiv(supply - shares, 1e18, supply);
        uint256 r2 = Math.mulDiv(r, r, 1e18);
        uint256 r4 = Math.mulDiv(r2, r2, 1e18);
        return Math.mulDiv(b, 1e18 - r4, 1e18);
    }

    function _usdCap(BasketHook h, MarketClock c, uint256 idx, uint256 shares) private view returns (uint256) {
        (uint256 nav,) = h.navUsd();
        uint256 usd = Math.mulDiv(shares, nav, h.totalSupply());
        uint256 px = idx == 3 ? 1e18 : c.priceUsd(idx);
        return Math.mulDiv(usd, 10 ** uint256(h.assetDecimals(idx)), px);
    }

    function cap(BasketHook h, uint256 idx) internal view returns (uint256) {
        return h.reserves()[idx] * 3000 / 10_000;
    }

    /// @dev ceil(g * bps * 3 / 40000)
    function fee(uint256 g, uint256 bps) internal pure returns (uint256) {
        return (g * bps * 3 + 39_999) / 40_000;
    }
}

/// @dev Shared fixture. Asset order everywhere is [NVDA, AAPL, MSFT, USDC].
abstract contract BasketBase is Deployers {
    uint256 internal constant T0 = 1_700_000_000;
    uint256 internal constant NV = 0;
    uint256 internal constant AA = 1;
    uint256 internal constant MS = 2;
    uint256 internal constant US = 3;
    uint160 internal constant FLAGS = Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG
        | Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG;

    MockStock internal nvda;
    MockStock internal aapl;
    MockStock internal msft;
    MockERC20 internal usdc;
    MarketClock internal clock;
    BasketHook internal hook;
    BasketRouter internal router;
    address[4] internal assets;

    address internal forwarder = makeAddr("forwarder");
    address internal bot = makeAddr("bot");
    address internal lp = makeAddr("lp");
    address internal treasury = makeAddr("treasury");

    struct Mdl {
        uint256 gross;
        uint256 edge;
        uint256 gapFee;
        uint256 fee;
        uint256 prot;
        uint256 out;
    }

    function setUp() public virtual {
        _deployAll();
        _seed();
    }

    // ---------------------------------------------------------------- deploy

    function _deployAll() internal {
        vm.warp(T0);
        deployFreshManagerAndRouters();
        nvda = new MockStock("tNVDA", "tNVDA", address(this));
        aapl = new MockStock("tAAPL", "tAAPL", address(this));
        msft = new MockStock("tMSFT", "tMSFT", address(this));
        usdc = new MockERC20("USDC", "USDC", 6);
        assets = [address(nvda), address(aapl), address(msft), address(usdc)];

        address[] memory fwds = new address[](1);
        fwds[0] = forwarder;
        clock = new MarketClock(address(this), [address(nvda), address(aapl), address(msft)], fwds);
        _push(200e18, 250e18, 500e18, true);

        address hookAddr = address(uint160(FLAGS) ^ (uint160(0x4444) << 144));
        deployCodeTo("BasketHook.sol:BasketHook", abi.encode(manager, clock, assets, address(this)), hookAddr);
        hook = BasketHook(hookAddr);
        router = new BasketRouter(manager);
        vm.label(hookAddr, "BasketHook");

        for (uint256 i; i < 4; ++i) {
            for (uint256 j = i + 1; j < 4; ++j) {
                manager.initialize(hook.poolKey(assets[i], assets[j]), 2 ** 96);
            }
        }
        _fundActor(bot, 1_000_000e18, 100_000_000e6);
        _fundActor(lp, 1_000_000e18, 100_000_000e6);
    }

    function _seed() internal {
        nvda.mint(address(this), 1250e18);
        aapl.mint(address(this), 1000e18);
        msft.mint(address(this), 500e18);
        usdc.mint(address(this), 250_000e6);
        for (uint256 i; i < 4; ++i) IERC20(assets[i]).approve(address(hook), type(uint256).max);
        hook.join([uint256(1250e18), 1000e18, 500e18, 250_000e6], 0);
    }

    function _fundActor(address a, uint256 stock18, uint256 usdc6) internal {
        nvda.mint(a, stock18);
        aapl.mint(a, stock18);
        msft.mint(a, stock18);
        usdc.mint(a, usdc6);
        vm.startPrank(a);
        for (uint256 i; i < 4; ++i) {
            IERC20(assets[i]).approve(address(router), type(uint256).max);
            IERC20(assets[i]).approve(address(hook), type(uint256).max);
        }
        vm.stopPrank();
    }

    // --------------------------------------------------------------- helpers

    function _report(uint256 p0, uint256 p1, uint256 p2, bool open) internal pure returns (bytes memory) {
        uint256[] memory p = new uint256[](3);
        p[0] = p0;
        p[1] = p1;
        p[2] = p2;
        return abi.encode(p, open);
    }

    function _push(uint256 p0, uint256 p1, uint256 p2, bool open) internal {
        clock.pushReport(_report(p0, p1, p2, open));
    }

    /// @dev Push a report equal to the pool-implied prices, so a swap carries no reference edge.
    function _align() internal {
        _push(
            hook.poolPriceUsd(address(nvda)),
            hook.poolPriceUsd(address(aapl)),
            hook.poolPriceUsd(address(msft)),
            true
        );
    }

    function _swap(address who, uint256 i, uint256 o, uint256 amt) internal returns (uint256 out) {
        PoolKey memory k = hook.poolKey(assets[i], assets[o]);
        bool zfo = assets[i] < assets[o];
        vm.prank(who);
        out = router.swapExactInput(k, zfo, amt, 0, who);
    }

    function _val(uint256 idx, uint256 amt, uint256 px) internal view returns (uint256) {
        return Math.mulDiv(amt, px, 10 ** uint256(hook.assetDecimals(idx)));
    }

    function _px() internal view returns (uint256[4] memory px) {
        for (uint256 i; i < 3; ++i) px[i] = clock.priceUsd(i);
        px[3] = 1e18;
    }

    /// @dev Independent re-implementation of the documented fee schedule for a fresh reference.
    function _model(uint256 i, uint256 o, uint256 amt, uint256 bps) internal view returns (Mdl memory m) {
        uint256[4] memory r = hook.reserves();
        uint256[4] memory px = _px();
        m.gross = Math.mulDiv(r[o], amt, r[i] + amt);
        uint256 inUsd = _val(i, amt, px[i]);
        uint256 outUsd = _val(o, m.gross, px[o]);
        m.edge = outUsd > inUsd ? outUsd - inUsd : 0;
        uint256 gapUsd = Math.mulDiv(m.edge, 8000, 10_000);
        m.gapFee = Math.min(
            Math.mulDiv(gapUsd, 10 ** uint256(hook.assetDecimals(o)), px[o]), Math.mulDiv(m.gross, 1000, 10_000)
        );
        uint256 posted = Math.mulDiv(m.gross, bps, 10_000);
        if (m.gapFee > posted) {
            m.fee = m.gapFee;
        } else {
            m.fee = posted;
            m.prot = Math.mulDiv(posted, 1000, 10_000);
        }
        m.out = m.gross - m.fee;
    }

    /// @dev Expected exitSingle net payout (gross minus the ceil'd three-quarter posted fee) at current state.
    function _expExitNet(uint256 idx, uint256 shares) internal view returns (uint256) {
        uint256 g = ExitModel.gross(hook, clock, idx, shares);
        return g - ExitModel.fee(g, hook.postedFeeBps());
    }

    function _hasSel(bytes memory data, bytes4 sel) internal pure returns (bool) {
        if (data.length < 4) return false;
        for (uint256 i; i + 4 <= data.length; ++i) {
            if (data[i] == sel[0] && data[i + 1] == sel[1] && data[i + 2] == sel[2] && data[i + 3] == sel[3]) {
                return true;
            }
        }
        return false;
    }

    /// @dev Call must revert and the revert data (possibly wrapped by v4) must contain `sel`.
    function _assertFailsWith(address target, bytes memory cd, bytes4 sel) internal {
        (bool ok, bytes memory ret) = target.call(cd);
        assertFalse(ok, "call should revert");
        assertTrue(_hasSel(ret, sel), "revert data lacks expected selector");
    }

    function _claim(uint256 i) internal view returns (uint256) {
        return manager.balanceOf(address(hook), uint256(uint160(assets[i])));
    }

    function _assertClaimsMatch() internal view {
        uint256[4] memory r = hook.reserves();
        uint256[4] memory pf = hook.protocolFees();
        for (uint256 i; i < 4; ++i) {
            assertEq(_claim(i), r[i] + pf[i], "claims != reserves + protocol fees");
        }
    }
}
