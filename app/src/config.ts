import { createPublicClient, defineChain, fallback, http, type Address, type Hash } from 'viem'
import { arcTestnet } from 'viem/chains'

// Arc's own RPC rate-limits contract reads on busy shared networks (a hackathon venue's WiFi), so reads fall back
// across Arc's RPC providers. Wallets that add Arc through the app get the same list.
const RPCS = ['https://rpc.drpc.testnet.arc.io', 'https://rpc.blockdaemon.testnet.arc.io', 'https://rpc.testnet.arc.io']

// viem ships Arc testnet (with multicall3); the RPCs and explorer below are the ones this deployment uses.
export const arc = defineChain({
  ...arcTestnet,
  rpcUrls: { default: { http: RPCS } },
  blockExplorers: { default: { name: 'Arc explorer', url: 'https://explorer.testnet.arc.io' } },
})

// From deployments/arc-testnet.json.
export const HOOK: Address = '0xbF0EF20ace8103D22DaDd9e98bF49Abc969a2888'
export const ROUTER: Address = '0x5b4781DdBb82EA8Ce01A9ae8392646f89D2A54cf'
export const CLOCK: Address = '0x11e65932196B07617180A8Fc5D1885BFd1170e9F'
/** Block of the first deploy transaction: activity never pages back past it. */
export const DEPLOY_BLOCK = 71057256n

/** Basket order, matching the hook's asset indices. */
export const ASSETS = [
  { symbol: 'tNVDA', name: 'Nvidia', token: '0xb462642086474956f572bD5D9c5352F9FFe51548', decimals: 18 },
  { symbol: 'tAAPL', name: 'Apple', token: '0x7CD5378302AF1086DbA7C6E4D3610e63ef71F55c', decimals: 18 },
  { symbol: 'tMSFT', name: 'Microsoft', token: '0x21369835194F59E895636F92359dE3C3241997Ab', decimals: 18 },
  { symbol: 'USDC', name: 'USDC', token: '0x3600000000000000000000000000000000000000', decimals: 6 },
] as const satisfies readonly { symbol: string; name: string; token: Address; decimals: number }[]

export const USDC = 3
export const STOCKS = [0, 1, 2] as const
export const FAUCET_URL = 'https://faucet.circle.com'
export const BANNER = 'Arc testnet. The stock tokens are test tokens; the prices are real and the fund settles in Arc USDC.'

/** The repo's README; the footer link is hidden while this is unset. */
export const README_URL: string | undefined = undefined

/** The Monday replay on Arc testnet: a bot bought a 5% Nvidia gap and the hook kept 80% of its edge. */
export const REPLAY_TX = '0x1adca61ace051fba6695322d09163a21415ea5793aafd9db85de31da5d96b13d' as const

export const client = createPublicClient({
  chain: arc,
  // Each RPC retries once with backoff, then the next one takes the request.
  transport: fallback(RPCS.map((url) => http(url, { retryCount: 1, retryDelay: 600, timeout: 20_000 }))),
  pollingInterval: 1_500,
})

export const txUrl = (hash: Hash) => `${arc.blockExplorers.default.url}/tx/${hash}`
export const addressUrl = (address: Address) => `${arc.blockExplorers.default.url}/address/${address}`
