import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { addressUrl, publicClient, txUrl } from '../chain'
import { ASSETS, DEPLOY_BLOCK, HOOK, LOG_CHUNK, assetByAddress, hookAbi } from '../config'
import { ago, fmtShares, fmtToken, fmtUsd, shortAddr } from '../format'
import { valueUsd } from '../math'
import { Button, Card, Dot, Pill, useNow } from '../ui'
import { useFund } from '../useFund'
import { useWallet } from '../wallet'

type Raw =
  | { kind: 'Swap'; assetIn: string; assetOut: string; amountIn: bigint; amountOut: bigint; feeOut: bigint; protocolFee: bigint; edgeUsd: bigint; gapFee: bigint }
  | { kind: 'Joined'; shares: bigint; amounts: readonly bigint[] }
  | { kind: 'Exited'; shares: bigint; amounts: readonly bigint[] }

interface Item {
  id: string
  block: bigint
  logIndex: number
  hash: string
  from?: string
  timestamp?: number
  raw: Raw
}

const EVENTS = hookAbi.filter((x) => x.type === 'event')
const MAX_CHUNKS_PER_LOAD = 6
const WANT_EVENTS = 12

function toItem(log: Awaited<ReturnType<typeof publicClient.getLogs>>[number]): Item | null {
  const l = log as unknown as { eventName: string; args: Record<string, unknown>; blockNumber: bigint; logIndex: number; transactionHash: string }
  const base = { id: `${l.transactionHash}-${l.logIndex}`, block: l.blockNumber, logIndex: l.logIndex, hash: l.transactionHash }
  if (l.eventName === 'Swap') return { ...base, raw: { kind: 'Swap', ...(l.args as Omit<Extract<Raw, { kind: 'Swap' }>, 'kind'>) } }
  if (l.eventName === 'Joined') return { ...base, raw: { kind: 'Joined', ...(l.args as Omit<Extract<Raw, { kind: 'Joined' }>, 'kind'>) } }
  if (l.eventName === 'Exited') return { ...base, raw: { kind: 'Exited', ...(l.args as Omit<Extract<Raw, { kind: 'Exited' }>, 'kind'>) } }
  return null
}

function amountsText(amounts: readonly bigint[]): string {
  const nz = amounts.map((a, i) => ({ a, i })).filter((x) => x.a > 0n)
  if (nz.length >= 4) return 'all four assets'
  return nz.map(({ a, i }) => `${fmtToken(a, ASSETS[i].decimals)} ${ASSETS[i].symbol}`).join(' + ') || '–'
}

export function ActivityPage() {
  const { data } = useFund()
  const { account } = useWallet()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const cursor = useRef<bigint | null>(null)
  const busy = useRef(false)
  const stamps = useRef(new Map<bigint, number>())
  const senders = useRef(new Map<string, string>())

  const enrich = useCallback(async (list: Item[]): Promise<Item[]> => {
    const blocks = [...new Set(list.filter((i) => !stamps.current.has(i.block)).map((i) => i.block))]
    const hashes = [...new Set(list.filter((i) => !senders.current.has(i.hash)).map((i) => i.hash))]
    await Promise.all([
      ...blocks.map((n) =>
        publicClient
          .getBlock({ blockNumber: n })
          .then((b) => stamps.current.set(n, Number(b.timestamp)))
          .catch(() => undefined),
      ),
      ...hashes.map((h) =>
        publicClient
          .getTransaction({ hash: h as `0x${string}` })
          .then((t) => senders.current.set(h, t.from))
          .catch(() => undefined),
      ),
    ])
    return list.map((i) => ({ ...i, timestamp: stamps.current.get(i.block), from: senders.current.get(i.hash) }))
  }, [])

  const load = useCallback(
    async (reset: boolean) => {
      if (busy.current) return
      busy.current = true
      setLoading(true)
      setError(null)
      try {
        let toBlock: bigint
        if (reset || cursor.current === null) {
          toBlock = await publicClient.getBlockNumber()
          cursor.current = toBlock
          setItems([])
          setDone(false)
        } else {
          toBlock = cursor.current
        }
        let chunks = 0
        let fresh: Item[] = []
        while (chunks < MAX_CHUNKS_PER_LOAD && fresh.length < WANT_EVENTS) {
          if (toBlock < DEPLOY_BLOCK) break
          let fromBlock = toBlock - LOG_CHUNK + 1n
          if (fromBlock < DEPLOY_BLOCK) fromBlock = DEPLOY_BLOCK
          const logs = await publicClient.getLogs({ address: HOOK, events: EVENTS, fromBlock, toBlock })
          fresh = fresh.concat(logs.map(toItem).filter((x): x is Item => !!x))
          chunks += 1
          toBlock = fromBlock - 1n
          cursor.current = toBlock
          if (fromBlock <= DEPLOY_BLOCK) break
        }
        if (toBlock < DEPLOY_BLOCK) setDone(true)
        const enriched = await enrich(fresh)
        setItems((prev) => {
          const map = new Map(prev.map((i) => [i.id, i]))
          for (const i of enriched) map.set(i.id, i)
          return [...map.values()].sort((a, b) => (a.block === b.block ? b.logIndex - a.logIndex : a.block > b.block ? -1 : 1))
        })
      } catch {
        setError('Could not read past events from the RPC. Try again.')
      } finally {
        busy.current = false
        setLoading(false)
      }
    },
    [enrich],
  )

  useEffect(() => {
    const t = setTimeout(() => void load(true), 0)
    return () => clearTimeout(t)
  }, [load])

  const nowSec = useNow(30_000).getTime() / 1000

  function describe(i: Item): { type: string; gap: boolean; title: string; sub?: string } {
    const r = i.raw
    if (r.kind === 'Swap') {
      const ain = assetByAddress(r.assetIn)
      const aout = assetByAddress(r.assetOut)
      const title = ain && aout ? `Swapped ${fmtToken(r.amountIn, ain.decimals)} ${ain.symbol} for ${fmtToken(r.amountOut, aout.decimals)} ${aout.symbol}` : 'Swap'
      const gap = r.gapFee > 0n && r.protocolFee === 0n && r.feeOut === r.gapFee
      if (gap) {
        const share = data ? BigInt(data.gapShareBps) : 8000n
        const toFund = (r.edgeUsd * share) / 10_000n
        return { type: 'Gap fee', gap: true, title, sub: `${fmtUsd(toFund)} to the fund, from the trader's ${fmtUsd(r.edgeUsd)} edge at Chainlink's prices.` }
      }
      const feeUsd = data && aout ? valueUsd(aout.index, r.feeOut, data.refPrices) : null
      return { type: 'Swap', gap: false, title, sub: feeUsd !== null ? `Posted fee ${fmtUsd(feeUsd)}.` : undefined }
    }
    if (r.kind === 'Joined') return { type: 'Buy', gap: false, title: `Bought ${fmtShares(r.shares)} BSKT with ${amountsText(r.amounts)}` }
    return { type: 'Sale', gap: false, title: `Sold ${fmtShares(r.shares)} BSKT for ${amountsText(r.amounts)}` }
  }

  return (
    <Card className="mx-auto max-w-[1130px] lg:mx-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display text-[26px]">Swaps, buys and sales</h2>
        <span className="label text-[13px] text-ink-2">Read from the hook's events on Arc</span>
      </div>

      {error && (
        <p role="alert" className="label mt-4 rounded-2xl bg-bad-soft px-4 py-3 text-[13px] font-medium text-bad">
          {error}
        </p>
      )}

      <ul className="mt-3 divide-y divide-line border-t border-line">
        {items.map((i) => {
          const d = describe(i)
          const mine = !!account && !!i.from && i.from.toLowerCase() === account.toLowerCase()
          return (
            <li key={i.id} className="py-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <Pill tone={d.gap ? 'red' : 'grey'}>
                  <Dot /> {d.type}
                </Pill>
                <span className="label num min-w-0 break-words text-[15px] font-semibold">{d.title}</span>
                {mine && <Pill tone="lav">You</Pill>}
              </div>
              {d.sub && <p className="label num mt-1.5 text-[14px] text-ink-2">{d.sub}</p>}
              <div className="label mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">
                {i.from && (
                  <a href={addressUrl(i.from)} target="_blank" rel="noopener noreferrer" className="num font-medium text-accent-ink underline underline-offset-2">
                    {shortAddr(i.from)}
                  </a>
                )}
                <span className="num">{i.timestamp ? ago(Math.max(0, nowSec - i.timestamp)) : `Block ${i.block.toLocaleString('en-US')}`}</span>
                <a href={txUrl(i.hash)} target="_blank" rel="noopener noreferrer" className="font-medium text-accent-ink underline underline-offset-2">
                  View transaction
                </a>
              </div>
            </li>
          )
        })}
      </ul>

      {!loading && items.length === 0 && !error && (
        <p className="label mt-4 rounded-2xl bg-well px-4 py-6 text-center text-[14px] text-ink-2">
          No activity in the blocks scanned so far.{done ? ' That is everything since the deploy.' : ' Show older activity to keep looking.'}
        </p>
      )}

      <div className="mt-5">
        {!done ? (
          <Button variant="outline" onClick={() => void load(false)} disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {loading ? 'Reading the chain…' : 'Show older activity'}
          </Button>
        ) : (
          <p className="label text-[13px] text-ink-2">You have reached the deploy block.</p>
        )}
      </div>
    </Card>
  )
}
