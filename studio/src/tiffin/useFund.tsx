import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Address } from 'viem'
import { publicClient } from './chain'
import { ASSETS, CLOCK, HOOK, POLL_MS, ROUTER, clockAbi, erc20Abi, hookAbi } from './config'
import { WAD } from './format'
import { useWallet } from './wallet'

export interface WalletReads {
  balances: bigint[] // 4 assets
  bskt: bigint
  allowanceRouter: bigint[] // 4 assets -> router
  allowanceHookUsdc: bigint // USDC -> hook
}

export interface FundData {
  block: bigint
  blockTime: number
  fetchedAt: number
  reserves: bigint[]
  protocolFees: bigint[]
  nav: bigint
  fresh: boolean
  sharePrice: bigint
  supply: bigint
  postedBps: number
  openBps: number
  closedBps: number
  staleBps: number
  protocolShareBps: number
  maxPriceAge: number
  totalFeesUsd: bigint
  gapCapturedUsd: bigint
  protocolEarnedUsd: bigint
  swapCount: bigint
  poolPrices: bigint[] // 3 stocks, USD18 per token
  /** Chainlink reference prices for [NVDA, AAPL, MSFT, USDC], USD18. */
  refPrices: bigint[]
  priceTimes: number[]
  marketOpen: boolean
  marketTime: number
  wallet: WalletReads | null
}

interface FundCtx {
  data: FundData | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  /** Seconds on the chain clock now (block time advanced by local elapsed time). */
  chainNow: () => number
}

const Ctx = createContext<FundCtx | null>(null)

type RawResult = { status: 'success'; result: unknown } | { status: 'failure'; error: Error }

function val<T>(r: RawResult, fallback: T): T {
  return r.status === 'success' ? (r.result as T) : fallback
}

export async function readAll(account: Address | null): Promise<FundData> {
  const hook = { address: HOOK, abi: hookAbi } as const
  const base = [
    { ...hook, functionName: 'reserves' },
    { ...hook, functionName: 'protocolFees' },
    { ...hook, functionName: 'navUsd' },
    { ...hook, functionName: 'sharePriceUsd' },
    { ...hook, functionName: 'totalSupply' },
    { ...hook, functionName: 'postedFeeBps' },
    { ...hook, functionName: 'openFeeBps' },
    { ...hook, functionName: 'closedFeeBps' },
    { ...hook, functionName: 'staleFeeBps' },
    { ...hook, functionName: 'protocolShareBps' },
    { ...hook, functionName: 'maxPriceAge' },
    { ...hook, functionName: 'totalFeesUsd' },
    { ...hook, functionName: 'gapCapturedUsd' },
    { ...hook, functionName: 'protocolEarnedUsd' },
    { ...hook, functionName: 'swapCount' },
    { ...hook, functionName: 'poolPriceUsd', args: [ASSETS[0].address] },
    { ...hook, functionName: 'poolPriceUsd', args: [ASSETS[1].address] },
    { ...hook, functionName: 'poolPriceUsd', args: [ASSETS[2].address] },
    { address: CLOCK, abi: clockAbi, functionName: 'state' },
  ] as const

  const walletCalls = account
    ? [
        ...ASSETS.map((a) => ({ address: a.address, abi: erc20Abi, functionName: 'balanceOf', args: [account] }) as const),
        { ...hook, functionName: 'balanceOf', args: [account] } as const,
        ...ASSETS.map((a) => ({ address: a.address, abi: erc20Abi, functionName: 'allowance', args: [account, ROUTER] }) as const),
        { address: ASSETS[3].address, abi: erc20Abi, functionName: 'allowance', args: [account, HOOK] } as const,
      ]
    : []

  const calls: unknown[] = [...base, ...walletCalls]
  const [results, block] = await Promise.all([
    publicClient.multicall({ contracts: calls as never, allowFailure: true }),
    publicClient.getBlock(),
  ])
  const r = results as unknown as RawResult[]

  const reserves = val<readonly bigint[]>(r[0], [0n, 0n, 0n, 0n])
  const navPair = val<readonly [bigint, boolean]>(r[2], [0n, false])
  const clock = val<readonly [readonly bigint[], readonly bigint[], boolean, bigint]>(r[18], [[0n, 0n, 0n], [0n, 0n, 0n], false, 0n])

  let wallet: WalletReads | null = null
  if (account) {
    const w = r.slice(base.length)
    wallet = {
      balances: [0, 1, 2, 3].map((i) => val<bigint>(w[i], 0n)),
      bskt: val<bigint>(w[4], 0n),
      allowanceRouter: [0, 1, 2, 3].map((i) => val<bigint>(w[5 + i], 0n)),
      allowanceHookUsdc: val<bigint>(w[9], 0n),
    }
  }

  return {
    block: block.number,
    blockTime: Number(block.timestamp),
    fetchedAt: Date.now(),
    reserves: [...reserves],
    protocolFees: [...val<readonly bigint[]>(r[1], [0n, 0n, 0n, 0n])],
    nav: navPair[0],
    fresh: navPair[1],
    sharePrice: val<bigint>(r[3], WAD),
    supply: val<bigint>(r[4], 0n),
    postedBps: Number(val<bigint>(r[5], 0n)),
    openBps: Number(val<number>(r[6], 30)),
    closedBps: Number(val<number>(r[7], 60)),
    staleBps: Number(val<number>(r[8], 200)),
    protocolShareBps: Number(val<number>(r[9], 1000)),
    maxPriceAge: Number(val<bigint>(r[10], 21600n)),
    totalFeesUsd: val<bigint>(r[11], 0n),
    gapCapturedUsd: val<bigint>(r[12], 0n),
    protocolEarnedUsd: val<bigint>(r[13], 0n),
    swapCount: val<bigint>(r[14], 0n),
    poolPrices: [val<bigint>(r[15], 0n), val<bigint>(r[16], 0n), val<bigint>(r[17], 0n)],
    refPrices: [...clock[0], WAD],
    priceTimes: clock[1].map((t) => Number(t)),
    marketOpen: clock[2],
    marketTime: Number(clock[3]),
    wallet,
  }
}

export function FundProvider({ children, seed }: { children: ReactNode; seed?: FundData | null }) {
  const { account } = useWallet()
  const [data, setData] = useState<FundData | null>(seed ?? null)
  const [loading, setLoading] = useState(!seed)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  const dataRef = useRef<FundData | null>(seed ?? null)

  const refresh = useCallback(async () => {
    const mine = ++seq.current
    try {
      const next = await readAll(account)
      if (mine !== seq.current) return
      dataRef.current = next
      setData(next)
      setError(null)
    } catch {
      if (mine === seq.current) setError('Could not read the chain. Retrying shortly.')
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [account])

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0)
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [refresh])

  const chainNow = useCallback(() => {
    const d = dataRef.current
    if (!d) return Math.floor(Date.now() / 1000)
    return d.blockTime + (Date.now() - d.fetchedAt) / 1000
  }, [])

  const value = useMemo(() => ({ data, loading, error, refresh, chainNow }), [data, loading, error, refresh, chainNow])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useFund(): FundCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useFund must be used inside FundProvider')
  return v
}
