import { createPublicClient, defineChain, http } from 'viem'
import { registerChain } from '../tracing'
import { CHAIN_ID, EXPLORER, MULTICALL3, NATIVE, RPC_URL } from './config'

export const arcTestnet = defineChain({
  id: CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: NATIVE.symbol, symbol: NATIVE.symbol, decimals: NATIVE.decimals },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: EXPLORER } },
  contracts: { multicall3: { address: MULTICALL3 } },
  testnet: true,
})

registerChain(CHAIN_ID, RPC_URL)

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(RPC_URL, { batch: true, retryCount: 2 }),
})

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`
export const addressUrl = (addr: string) => `${EXPLORER}/address/${addr}`
