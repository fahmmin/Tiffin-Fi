import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { loadSaved, latestBlock, mergeItems, readWindow, saveActivity, type Item } from '../activityData'
import { addressUrl, publicClient, txUrl } from '../chain'
import { ASSETS, DEPLOY_BLOCK, LOG_CHUNK, POLL_MS, assetByAddress } from '../config'
import { ago, fmtDateTime, fmtShares, fmtToken, fmtUsd, shortAddr } from '../format'
import { valueUsd } from '../math'
import { Button, Card, Dot, PENDING, Pill, useNow } from '../ui'
import { useFund } from '../useFund'
import { useWallet } from '../wallet'

const MAX_CHUNKS_PER_LOAD = 6
const WANT_EVENTS = 12
const READ_FAILED = 'Could not read past events from the RPC. Try again.'

function amountsText(amounts: readonly bigint[]): string {
  const nz = amounts.map((a, i) => ({ a, i })).filter((x) => x.a > 0n)
  if (nz.length >= 4) return 'all four assets'
  return nz.map(({ a, i }) => `${fmtToken(a, ASSETS[i].decimals)} ${ASSETS[i].symbol}`).join(' + ') || '–'
}

export function ActivityPage() {
  const { data } = useFund()
  const { account } = useWallet()
  // Rows saved by an earlier visit show at once; only events newer than the newest one are fetched.
  const [saved] = useState(loadSaved)
  const [items, setItems] = useState<Item[]>(saved?.items ?? [])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [quiet, setQuiet] = useState(false)
  const [done, setDone] = useState(saved?.done ?? false)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [filter, setFilter] = useState<'all' | 'mine'>('all')
  const itemsRef = useRef<Item[]>(saved?.items ?? [])
  const cursor = useRef<bigint | null>(saved?.cursor ?? null)
  const top = useRef<bigint | null>(saved?.top ?? null)
  const doneRef = useRef(saved?.done ?? false)
  const busy = useRef(false)
  const errorKind = useRef<'first' | 'older' | null>(null)
  const stamps = useRef(new Map<bigint, number>())
  const senders = useRef(new Map<string, string>())

  // Adds the time and sender to rows that lack them. The explorer already gives the time; the sender is one read each.
  const enrich = useCallback(async (list: Item[]): Promise<Item[]> => {
    for (const i of itemsRef.current) {
      if (i.timestamp) stamps.current.set(i.block, i.timestamp)
      if (i.from) senders.current.set(i.hash, i.from)
    }
    for (const i of list) if (i.timestamp) stamps.current.set(i.block, i.timestamp)
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
    return list.map((i) => ({ ...i, timestamp: stamps.current.get(i.block) ?? i.timestamp, from: senders.current.get(i.hash) ?? i.from }))
  }, [])

  const commit = useCallback((next: Item[]) => {
    itemsRef.current = next
    setItems(next)
    saveActivity({ items: next, cursor: cursor.current, done: doneRef.current, top: top.current })
  }, [])

  /** Reads blocks backwards from `start`, stopping after enough events or chunks. Moves the "older" cursor. */
  const readBack = useCallback(async (start: bigint): Promise<Item[]> => {
    let toBlock = start
    let chunks = 0
    let fresh: Item[] = []
    while (chunks < MAX_CHUNKS_PER_LOAD && fresh.length < WANT_EVENTS) {
      if (toBlock < DEPLOY_BLOCK) break
      let fromBlock = toBlock - LOG_CHUNK + 1n
      if (fromBlock < DEPLOY_BLOCK) fromBlock = DEPLOY_BLOCK
      fresh = fresh.concat(await readWindow(fromBlock, toBlock))
      chunks += 1
      toBlock = fromBlock - 1n
      if (fromBlock <= DEPLOY_BLOCK) break
    }
    cursor.current = toBlock
    doneRef.current = toBlock < DEPLOY_BLOCK
    setDone(doneRef.current)
    return fresh
  }, [])

  /** First open with nothing saved: the latest events. With rows saved: only blocks from the newest saved row on. */
  const loadNewer = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setLoading(true)
    try {
      const latest = await latestBlock()
      const have = itemsRef.current
      const newest = have.reduce<bigint | null>((m, i) => (m === null || i.block > m ? i.block : m), null)
      const floor = newest ?? top.current
      let fresh: Item[] = []
      if (floor === null) {
        fresh = await readBack(latest)
      } else {
        let to = latest
        while (to >= floor) {
          const from = to - LOG_CHUNK + 1n > floor ? to - LOG_CHUNK + 1n : floor
          fresh = fresh.concat(await readWindow(from, to))
          to = from - 1n
        }
      }
      top.current = latest
      const missing = have.filter((i) => !i.from || !i.timestamp).slice(0, 30)
      const enriched = await enrich([...fresh, ...missing])
      commit(mergeItems(itemsRef.current, enriched))
      errorKind.current = null
      setError(null)
      setQuiet(false)
      setUpdatedAt(Date.now())
    } catch {
      // Saved rows are never replaced by an error: they stay, with a quiet note.
      if (itemsRef.current.length > 0) setQuiet(true)
      else {
        errorKind.current = 'first'
        setError(READ_FAILED)
      }
    } finally {
      busy.current = false
      setLoading(false)
    }
  }, [commit, enrich, readBack])

  const loadOlder = useCallback(async () => {
    if (busy.current || cursor.current === null) return
    busy.current = true
    setLoading(true)
    try {
      const fresh = await readBack(cursor.current)
      const enriched = await enrich(fresh)
      commit(mergeItems(itemsRef.current, enriched))
      errorKind.current = null
      setError(null)
    } catch {
      errorKind.current = 'older'
      setError(READ_FAILED)
    } finally {
      busy.current = false
      setLoading(false)
    }
  }, [commit, enrich, readBack])

  const retry = useCallback(() => (errorKind.current === 'older' ? loadOlder() : loadNewer()), [loadNewer, loadOlder])

  useEffect(() => {
    const t = setTimeout(() => void loadNewer(), 0)
    return () => clearTimeout(t)
  }, [loadNewer])

  // Every 15 seconds: look for new events, or retry the read that failed. Errors never replace saved rows.
  useEffect(() => {
    const id = setInterval(() => {
      if (!busy.current && document.visibilityState === 'visible') void retry()
    }, POLL_MS)
    return () => clearInterval(id)
  }, [retry])

  const nowSec = useNow(30_000).getTime() / 1000

  interface Described {
    type: string
    gap: boolean
    title: string
    /** USD value of the trade at today's Chainlink prices. */
    worth: bigint | null
    /** The fee line: what was paid and which fee applied. */
    fee?: string
  }

  function describe(i: Item): Described {
    const r = i.raw
    const refs = data?.refPrices
    if (r.kind === 'Swap') {
      const ain = assetByAddress(r.assetIn)
      const aout = assetByAddress(r.assetOut)
      const title = ain && aout ? `Swapped ${fmtToken(r.amountIn, ain.decimals)} ${ain.symbol} for ${fmtToken(r.amountOut, aout.decimals)} ${aout.symbol}` : 'Swap'
      const worth = refs && ain ? valueUsd(ain.index, r.amountIn, refs) : null
      const gap = r.gapFee > 0n && r.protocolFee === 0n && r.feeOut === r.gapFee
      if (gap) {
        const share = data ? BigInt(data.gapShareBps) : 8000n
        const toFund = (r.edgeUsd * share) / 10_000n
        return {
          type: 'Gap fee',
          gap: true,
          title,
          worth,
          fee: `Gap fee applied: ${fmtUsd(toFund)} to the fund, ${data ? data.gapShareBps / 100 : 80}% of the trader's ${fmtUsd(r.edgeUsd)} edge at Chainlink's prices.`,
        }
      }
      const feeUsd = refs && aout ? valueUsd(aout.index, r.feeOut, refs) : null
      return { type: 'Swap', gap: false, title, worth, fee: feeUsd !== null ? `Posted fee ${fmtUsd(feeUsd)}. No gap fee.` : 'Posted fee. No gap fee.' }
    }
    const worth = refs ? r.amounts.reduce((sum, a, k) => sum + valueUsd(k, a, refs), 0n) : null
    if (r.kind === 'Joined') return { type: 'Buy', gap: false, title: `Bought ${fmtShares(r.shares)} BSKT with ${amountsText(r.amounts)}`, worth }
    return { type: 'Sale', gap: false, title: `Sold ${fmtShares(r.shares)} BSKT for ${amountsText(r.amounts)}`, worth }
  }

  const isMine = (i: Item) => {
    if (!account) return false
    const me = account.toLowerCase()
    const acct = i.raw.kind === 'Swap' ? undefined : i.raw.account
    return i.from?.toLowerCase() === me || acct?.toLowerCase() === me
  }
  const showMine = filter === 'mine' && !!account
  const shown = showMine ? items.filter(isMine) : items

  return (
    <Card className="mx-auto max-w-[1130px] lg:mx-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display text-[26px]">Swaps, buys and sales</h2>
        <span className="label text-[13px] text-ink-2">Read from the hook's events on Arc</span>
      </div>

      {error && (
        <p role="alert" className="label mt-4 rounded-2xl bg-bad-soft px-4 py-3 text-[13px] font-medium text-bad">
          {error}{' '}
          <button
            type="button"
            onClick={() => void retry()}
            disabled={loading}
            className="font-semibold underline underline-offset-2 disabled:opacity-50"
          >
            Try again
          </button>
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div role="group" aria-label="Filter activity" className="inline-flex rounded-full bg-well p-1">
          {(['all', 'mine'] as const).map((f) => {
            const disabled = f === 'mine' && !account
            const active = (f === 'mine' ? showMine : !showMine) && !disabled
            return (
              <button
                key={f}
                type="button"
                aria-pressed={active}
                disabled={disabled}
                title={disabled ? 'Connect a wallet to see your own activity' : undefined}
                onClick={() => setFilter(f)}
                className={`label min-h-10 rounded-full px-5 text-[14px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'bg-white text-ink shadow-card' : 'text-ink-2 hover:text-ink'}`}
              >
                {f === 'all' ? 'All' : 'Mine'}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-3">
          <span className="label text-[13px] text-ink-2" aria-live="polite">
            {quiet && items.length > 0
              ? "Couldn't refresh, showing saved activity"
              : updatedAt !== null
                ? nowSec - updatedAt / 1000 < 60
                  ? 'Updated just now'
                  : `Updated ${ago(nowSec - updatedAt / 1000)}`
                : ''}
          </span>
          <Button variant="outline" onClick={() => void loadNewer()} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}
            Refresh
          </Button>
        </div>
      </div>

      <ul className="mt-3 divide-y divide-line border-t border-line">
        {shown.map((i) => {
          const d = describe(i)
          const mine = isMine(i)
          return (
            <li key={i.id} className="py-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <Pill tone={d.gap ? 'red' : 'grey'}>
                  <Dot /> {d.type}
                </Pill>
                <span className="label num min-w-0 break-words text-[15px] font-semibold">{d.title}</span>
                {mine && <Pill tone="lav">You</Pill>}
              </div>
              <p className="label num mt-1.5 text-[14px] text-ink-2">
                Worth {d.worth !== null ? fmtUsd(d.worth) : PENDING} at today's Chainlink prices.
                {d.fee ? ` ${d.fee}` : ''}
              </p>
              <div className="label mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">
                {i.from && (
                  <a href={addressUrl(i.from)} target="_blank" rel="noopener noreferrer" className="num font-medium text-accent-ink underline underline-offset-2">
                    {shortAddr(i.from)}
                  </a>
                )}
                <span className="num">
                  {i.timestamp ? `${fmtDateTime(i.timestamp)}, ${ago(Math.max(0, nowSec - i.timestamp))}` : `Block ${i.block.toLocaleString('en-US')}`}
                </span>
                <a href={txUrl(i.hash)} target="_blank" rel="noopener noreferrer" className="font-medium text-accent-ink underline underline-offset-2">
                  View transaction
                </a>
              </div>
            </li>
          )
        })}
      </ul>

      {!loading && shown.length === 0 && !error && (
        <p className="label mt-4 rounded-2xl bg-well px-4 py-6 text-center text-[14px] text-ink-2">
          {showMine ? 'None of your activity in the blocks scanned so far.' : 'No activity in the blocks scanned so far.'}
          {done ? ' That is everything since the deploy.' : ' Load older to keep looking.'}
        </p>
      )}

      <div className="mt-5">
        {!done ? (
          <Button variant="outline" onClick={() => void loadOlder()} disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {loading ? 'Reading the chain…' : 'Load older'}
          </Button>
        ) : (
          <p className="label text-[13px] text-ink-2">You have reached the deploy block.</p>
        )}
      </div>
    </Card>
  )
}
