// Shared Arc testnet setup for the chain scripts. The key comes from the environment, never from a file here.
import { readFileSync } from 'node:fs'
import { createPublicClient, createWalletClient, defineChain, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arc explorer', url: 'https://explorer.testnet.arc.io' } },
})

export const deployment = JSON.parse(readFileSync(new URL('../deployments/arc-testnet.json', import.meta.url), 'utf8'))

export const publicClient = createPublicClient({ chain: arcTestnet, transport: http() })

export function walletClient() {
  const key = process.env.PRIVATE_KEY
  if (!key) throw new Error('Set PRIVATE_KEY in the environment first')
  const account = privateKeyToAccount(key.startsWith('0x') ? key : `0x${key}`)
  return createWalletClient({ account, chain: arcTestnet, transport: http() })
}

export const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
])

export const hookAbi = parseAbi([
  'struct Quote { uint256 amountOut; uint256 feeOut; uint256 protocolFee; uint256 feeUsd; uint256 edgeUsd; bool gapFee; bool fresh; }',
  'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
  'function join(uint256[4] maxAmountsIn, uint256 minShares) returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function sharePriceUsd() view returns (uint256)',
  'function navUsd() view returns (uint256 nav, bool fresh)',
  'function reserves() view returns (uint256[4])',
  'function quote(uint8 assetIn, uint8 assetOut, uint256 amountIn) view returns (Quote)',
  'function poolKey(uint8 a, uint8 b) view returns (PoolKey)',
  'function poolPriceUsd(uint8 asset) view returns (uint256)',
  'function gapCapturedUsd() view returns (uint256)',
  'function totalFeesUsd() view returns (uint256)',
])

export const clockAbi = parseAbi([
  'function push(bytes report)',
  'function priceOf(address stock) view returns (uint256 price, uint256 updatedAt)',
  'function marketOpen() view returns (bool)',
])

export const routerAbi = parseAbi([
  'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
  'function swapExactIn(PoolKey key, bool zeroForOne, uint256 amountIn, uint256 minAmountOut, address to) returns (uint256)',
])

export const explorerTx = (hash) => `${arcTestnet.blockExplorers.default.url}/tx/${hash}`
