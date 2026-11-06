import { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { publicClient, txUrl } from '../chain'
import { ASSETS, DEPLOY_BLOCK, HOOK, LOG_CHUNK, assetByAddress, hookAbi } from '../config'
import { ago, fmtShares, fmtToken, fmtUsd, shortAddr } from '../format'
import { Button, Card, Pill, useNow } from '../ui'

type Kind = 'Swapped' | 'Joined' | 'Exited'

interface Item {
  id: string
  kind: Kind
  block: bigint
  logIndex: number
  hash: string
  timestamp?: number
  summary: string
  detail?: string
  gap: boolean
}

const EVENTS = hookAbi.filter((x) => x.type === 'event')

function amountsText(amounts: readonly bigint[]): string {
  const parts = amounts
    .map((a, i) => (a > 0n ? `${fmtToken(a, ASSETS[i].decimals)} ${ASSETS[i].symbol}` : null))
    .filter(Boolean)
  return parts.join(' + ') || '—'
}

function toItem(log: Awaited<ReturnType<typeof publicClient.getLogs>>[number]): Item | null {
  const l = log as unknown as { eventName: string; args: Record<string, unknown>; blockNumber: bigint; logIndex: number; transactionHash: string }
  const base = { id: `${l.transactionHash}-${l.logIndex}`, block: l.blockNumber, logIndex: l.logIndex, hash: l.transactionHash }
  if (l.eventName === 'Swap') {
    const a = l.args as { assetIn: string; assetOut: string; amountIn: bigint; amountOut: bigint; feeOut: bigint; protocolFee: bigint; edgeUsd: bigint; gapFee: bigint }
    const ain = assetByAddress(a.assetIn)
    const aout = assetByAddress(a.assetOut)
    if (!ain || !aout) return null
    const gap = a.gapFee > 0n && a.protocolFee === 0n && a.feeOut === a.gapFee
    return {
      ...base,
      kind: 'Swapped',
      summary: `${fmtToken(a.amountIn, ain.decimals)} ${ain.symbol} for ${fmtToken(a.amountOut, aout.decimals)} ${aout.symbol}`,
      detail: `Fee ${fmtToken(a.feeOut, aout.decimals)} ${aout.symbol}${gap ? `, gap edge ${fmtUsd(a.edgeUsd)}` : ''}`,
      gap,
    }
  }
  if (l.eventName === 'Joined') {
    const a = l.args as { account: string; shares: bigint; amounts: readonly bigint[] }
    return { ...base, kind: 'Joined', summary: `${shortAddr(a.account)} put in ${amountsText(a.amounts)}`, detail: `Received ${fmtShares(a.shares)} BSKT`, gap: false }
  }
  if (l.eventName === 'Exited') {
    const a = l.args as { account: string; shares: bigint; amounts: readonly bigint[] }
    return { ...base, kind: 'Exited', summary: `${shortAddr(a.account)} took out ${amountsText(a.amounts)}`, detail: `Burned ${fmtShares(a.shares)} BSKT`, gap: false }
  }
  return null
}

const MAX_CHUNKS_PER_LOAD = 6
const WANT_EVENTS = 8

export function ActivityPage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [scanned, setScanned] = useState<{ from: bigint; head: bigint } | null>(null)
  const cursor = useRef<bigint | null>(null) // next toBlock to scan (exclusive of what was scanned)
  const busy = useRef(false)
  const stamps = useRef(new Map<bigint, number>())

  const stamp = useCallback(async (list: Item[]) => {
    const need = [...new Set(list.filter((i) => !stamps.current.has(i.block)).map((i) => i.block))]
    await Promise.all(
      need.map((n) =>
        publicClient
          .getBlock({ blockNumber: n })
          .then((b) => stamps.current.set(n, Number(b.timestamp)))
          .catch(() => undefined),
      ),
    )
    return list.map((i) => ({ ...i, timestamp: stamps.current.get(i.block) }))
  }, [])

  const load = useCallback(
    async (reset: boolean) => {
      if (busy.current) return
      busy.current = true
      setLoading(true)
      setError(null)
      try {
        let toBlock: bigint
        let acc: Item[] = []
        if (reset || cursor.current === null) {
          toBlock = await publicClient.getBlockNumber()
          cursor.current = toBlock
          setItems([])
          setDone(false)
          setScanned({ from: toBlock, head: toBlock })
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
          const mapped = logs.map(toItem).filter((x): x is Item => !!x)
          fresh = fresh.concat(mapped)
          chunks += 1
          toBlock = fromBlock - 1n
          cursor.current = toBlock
          setScanned((s) => (s ? { ...s, from: fromBlock } : s))
          if (fromBlock <= DEPLOY_BLOCK) break
        }
        if (toBlock < DEPLOY_BLOCK) setDone(true)
        acc = await stamp(fresh)
        setItems((prev) => {
          const map = new Map(prev.map((i) => [i.id, i]))
          for (const i of acc) map.set(i.id, i)
          return [...map.values()].sort((a, b) => (a.block === b.block ? b.logIndex - a.logIndex : a.block > b.block ? -1 : 1))
        })
      } catch {
        setError('Could not read past events from the RPC. Try again.')
      } finally {
        busy.current = false
        setLoading(false)
      }
    },
    [stamp],
  )

  useEffect(() => {
    const t = setTimeout(() => void load(true), 0)
    return () => clearTimeout(t)
  }, [load])

  const nowSec = useNow(30_000).getTime() / 1000
  const tone = { Swapped: 'lav', Joined: 'cyan', Exited: 'grey' } as const

  return (
    <div className="mx-auto max-w-[820px] space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="display text-[24px]">Fund activity</h2>
            <p className="label mt-1 text-[14px] text-[#55526a]">Swaps, joins and exits from the hook, newest first.</p>
          </div>
          <Button variant="outline" onClick={() => void load(true)} disabled={loading} className="!min-h-10 !px-4 !py-2 text-sm">
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </Button>
        </div>

        {error && (
          <p role="alert" className="label mt-4 rounded-2xl bg-[#FFE9E9] px-4 py-3 text-[13px] text-[#8C1C1C]">
            {error}
          </p>
        )}

        <ul className="mt-4 divide-y divide-[#ECEBF1]">
          {items.map((i) => (
            <li key={i.id} className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={tone[i.kind]}>{i.kind}</Pill>
                  {i.gap && <Pill tone="amber">Gap fee</Pill>}
                </div>
                <span className="label num text-[12px] text-[#6b6878]">{i.timestamp ? ago(Math.max(0, nowSec - i.timestamp)) : `Block ${i.block.toLocaleString('en-US')}`}</span>
              </div>
              <p className="label num mt-2 break-words text-[15px] font-medium">{i.summary}</p>
              {i.detail && <p className="label num mt-0.5 text-[13px] text-[#55526a]">{i.detail}</p>}
              <a
                href={txUrl(i.hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="label mt-2 inline-flex min-h-8 items-center gap-1 text-[13px] font-medium text-accent-dark underline underline-offset-2"
              >
                {shortAddr(i.hash)} <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>

        {!loading && items.length === 0 && !error && (
          <p className="label mt-4 rounded-2xl bg-[#F4F3F8] px-4 py-6 text-center text-[14px] text-[#55526a]">
            No events in the blocks scanned so far.{done ? ' That is everything since the deploy.' : ' Load older blocks to keep looking.'}
          </p>
        )}

        <div className="mt-4 flex flex-col items-center gap-2">
          {scanned && (
            <p className="label num text-[12px] text-[#6b6878]">
              Scanned blocks {scanned.from.toLocaleString('en-US')} to {scanned.head.toLocaleString('en-US')} (9,000 per request)
            </p>
          )}
          {!done ? (
            <Button variant="outline" onClick={() => void load(false)} disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {loading ? 'Reading the chain…' : 'Load older blocks'}
            </Button>
          ) : (
            <p className="label text-[13px] text-[#55526a]">You have reached the deploy block.</p>
          )}
        </div>
      </Card>
    </div>
  )
}
