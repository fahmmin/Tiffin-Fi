import { createPublicClient, defineChain, fallback, http } from 'viem'
import { registerChain } from '../tracing'
import { CHAIN_ID, EXPLORER, MULTICALL3, NATIVE, RPC_URLS } from './config'

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

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`
export const addressUrl = (addr: string) => `${EXPLORER}/address/${addr}`
