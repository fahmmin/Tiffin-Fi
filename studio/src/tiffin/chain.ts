import { createPublicClient, defineChain, fallback, http } from 'viem'
import { registerChain } from '../tracing'
import { CHAIN_ID, EXPLORER, LOG_RPC_URLS, MULTICALL3, NATIVE, RPC_URLS } from './config'

export const arcTestnet = defineChain({
  id: CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: NATIVE.symbol, symbol: NATIVE.symbol, decimals: NATIVE.decimals },
  rpcUrls: { default: { http: [...RPC_URLS] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: EXPLORER } },
  contracts: { multicall3: { address: MULTICALL3 } },
  testnet: true,
})

for (const url of RPC_URLS) registerChain(CHAIN_ID, url)

/** Tries each RPC in order; one retry per endpoint before falling to the next. */
export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: fallback(RPC_URLS.map((url) => http(url, { batch: { batchSize: 10 }, retryCount: 1 }))),
})

/**
 * Logs only: endpoints that answer a 9,000-block eth_getLogs. No retries and no batching, so a bad range fails fast
 * and moves to the next endpoint instead of waiting.
 */
export const logsClient = createPublicClient({
  chain: arcTestnet,
  transport: fallback(LOG_RPC_URLS.map((url) => http(url, { retryCount: 0 })), { retryCount: 0 }),
})

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`
export const addressUrl = (addr: string) => `${EXPLORER}/address/${addr}`
