import { parseAbi, type Address } from 'viem'
import { getUsdc, requireChain } from '@/onchain-facts'

export const CHAIN_ID = 5042002
const arc = requireChain(CHAIN_ID)
const usdc = getUsdc(CHAIN_ID)
if (!usdc) throw new Error('USDC is not registered for Arc testnet')

/** Reads go through these in order; Arc's own RPC rate-limits contract reads on busy shared networks. */
export const RPC_URLS: readonly string[] = [
  'https://arc-testnet.g.alchemy.com/v2/30A2rMY5oLYzaSUSNlDqf8WweyIyeD9H',
  'https://rpc.drpc.testnet.arc.io',
  'https://rpc.blockdaemon.testnet.arc.io',
  arc.rpcUrls[0],
]
export const EXPLORER = arc.explorerBase
export const NATIVE = arc.nativeCurrency
export const MULTICALL3: Address = '0xcA11bde05977b3631167028862bE2a173976CA11'

/** Deployed Tiffin Fi contracts on Arc testnet. */
export const HOOK: Address = '0x4ff4fb09A5934aa98e5740465A5535fb25c6e888'
export const CLOCK: Address = '0x25610623501dfa7e73d5309ce7e31058bb487809'
export const ROUTER: Address = '0x34666e4b2b5022071c8205474ee8e252812bfd74'

/** Activity paging starts from the deploy block (about 71.07M), with a little slack. */
export const DEPLOY_BLOCK = 71_060_000n
export const LOG_CHUNK = 9_000n

export const POLL_MS = 15_000
export const SLIPPAGE_BPS = 50n // minimum output 0.5% below the estimate
export const SINGLE_ASSET_CAP_BPS = 3000n

export type AssetKey = 'NVDA' | 'AAPL' | 'MSFT' | 'USDC'

export interface AssetInfo {
  key: AssetKey
  index: 0 | 1 | 2 | 3
  name: string
  symbol: string
  address: Address
  decimals: number
  color: string
}

/** Order matches BasketHook.assets() and MarketClock prices: NVDA, AAPL, MSFT, USDC. */
export const ASSETS: readonly AssetInfo[] = [
  { key: 'NVDA', index: 0, name: 'Nvidia', symbol: 'tNVDA', address: '0xe99e06837468301ec7fab24e7092aefccda8dc50', decimals: 18, color: '#6E54FF' },
  { key: 'AAPL', index: 1, name: 'Apple', symbol: 'tAAPL', address: '0x846073a79a94e1c64c946855ec4f8d59ef5ba325', decimals: 18, color: '#7DE3FA' },
  { key: 'MSFT', index: 2, name: 'Microsoft', symbol: 'tMSFT', address: '0x4925d2907dbfd3801aee4165a0214df330b5cba6', decimals: 18, color: '#FF8BE0' },
  { key: 'USDC', index: 3, name: 'USDC', symbol: 'USDC', address: usdc.address as Address, decimals: usdc.decimals, color: '#0D0A1A' },
] as const

export const USDC_ASSET = ASSETS[3]
export const BSKT_DECIMALS = 18

export function assetByAddress(addr: string): AssetInfo | undefined {
  return ASSETS.find((a) => a.address.toLowerCase() === addr.toLowerCase())
}

export const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
])

const hookErrors = [
  'error StalePrices()',
  'error ExceedsSingleAssetCap()',
  'error Slippage()',
  'error InvalidAmount()',
  'error EmptyReserve()',
  'error InvalidAsset()',
  'error ExactOutputNotSupported()',
  'error PlainLiquidityDisabled()',
  'error SeedOwnerOnly()',
] as const

export const hookAbi = parseAbi([
  ...hookErrors,
  'struct Quote { uint256 amountOut; uint256 feeOut; uint256 protocolFee; uint256 feeUsd; uint256 edgeUsd; uint256 gapFee; bool fresh; }',
  'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
  'function reserves() view returns (uint256[4])',
  'function protocolFees() view returns (uint256[4])',
  'function navUsd() view returns (uint256 nav, bool fresh)',
  'function sharePriceUsd() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function postedFeeBps() view returns (uint256)',
  'function openFeeBps() view returns (uint16)',
  'function closedFeeBps() view returns (uint16)',
  'function staleFeeBps() view returns (uint16)',
  'function protocolShareBps() view returns (uint16)',
  'function maxPriceAge() view returns (uint256)',
  'function totalFeesUsd() view returns (uint256)',
  'function gapCapturedUsd() view returns (uint256)',
  'function protocolEarnedUsd() view returns (uint256)',
  'function swapCount() view returns (uint256)',
  'function GAP_SHARE_BPS() view returns (uint256)',
  'function poolPriceUsd(address asset) view returns (uint256)',
  'function quote(address assetIn, address assetOut, uint256 amountIn) view returns (Quote)',
  'function poolKey(address a, address b) view returns (PoolKey)',
  'function joinSingle(address asset, uint256 amountIn, uint256 minShares) returns (uint256 shares)',
  'function exitSingle(address asset, uint256 shares, uint256 minOut) returns (uint256 out)',
  'event Swap(address indexed assetIn, address indexed assetOut, uint256 amountIn, uint256 amountOut, uint256 feeOut, uint256 protocolFee, uint256 edgeUsd, uint256 gapFee)',
  'event Joined(address indexed account, uint256 shares, uint256[4] amounts)',
  'event Exited(address indexed account, uint256 shares, uint256[4] amounts)',
])

export const clockAbi = parseAbi([
  'function state() view returns (uint256[3] prices, uint256[3] priceTimes, bool open, uint256 marketTime)',
])

export const routerAbi = parseAbi([
  'error InvalidAmount()',
  'error Slippage()',
  'error WrappedError(address target, bytes4 selector, bytes reason, bytes details)',
  'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
  'function swapExactInput(PoolKey key, bool zeroForOne, uint256 amountIn, uint256 minAmountOut, address recipient) returns (uint256 amountOut)',
])
