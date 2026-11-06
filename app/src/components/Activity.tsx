import { useEffect, useMemo, useState } from 'react'
import { isAddressEqual, type Address } from 'viem'
import { ASSETS, DEPLOY_BLOCK, addressUrl, client, txUrl } from '../config.ts'
import { loadBackwards, loadForwards, logId, toEntries, type Entry, type Log } from '../lib/activity.ts'
import { ago, amount, shortAddress, usd } from '../lib/format.ts'
import { useNow } from '../lib/hooks.ts'
import { explain } from '../lib/tx.ts'

const PAGE = 25

export function Activity({ me }: { me?: Address }) {
  const [logs, setLogs] = useState<Map<string, Log>>(new Map())
  const [older, setOlder] = useState<bigint>() // where the next older page ends
  const [head, setHead] = useState<bigint>() // newest block read
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const now = useNow()

  const merge = (more: Log[]) =>
    setLogs((m) => {
      const next = new Map(m)
      for (const l of more) next.set(logId(l), l)
      return next
    })

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const latest = await client.getBlockNumber()
        const page = await loadBackwards(latest, PAGE)
        if (!live) return
        merge(page.logs)
        setOlder(page.next)
        setHead(latest)
      } catch (e) {
        if (live) setError(explain(e))
      } finally {
        if (live) setLoading(false)
      }
    })()
    return () => {
      live = false
    }
  }, [])

  // New events, every 15 s while the page is visible.
  useEffect(() => {
    if (head === undefined) return
    const id = setInterval(async () => {
      if (document.hidden) return
      try {
        const latest = await client.getBlockNumber()
        if (latest <= head) return
        merge(await loadForwards(head + 1n, latest))
        setHead(latest)
      } catch {
        // The next tick retries.
      }
    }, 15_000)
    return () => clearInterval(id)
  }, [head])

  async function loadOlder() {
    if (older === undefined) return
    setLoading(true)
    setError(undefined)
    try {
      const page = await loadBackwards(older, PAGE)
      merge(page.logs)
      setOlder(page.next)
    } catch (e) {
      setError(explain(e))
    } finally {
      setLoading(false)
    }
  }

  const entries = useMemo(() => toEntries(logs.values()), [logs])
  const allLoaded = older !== undefined && older < DEPLOY_BLOCK

  return (
    <section className="card" aria-labelledby="activity-title">
      <div className="card-head">
        <h2 id="activity-title">Swaps, buys and sales</h2>
        <span className="muted small">Read from the hook's events on Arc</span>
      </div>

      {entries.length > 0 && (
        <ul className="entries">
          {entries.map((e) => (
            <Row key={e.id} entry={e} me={me} now={now} />
          ))}
        </ul>
      )}

      {!loading && !error && entries.length === 0 && (
        <p className="empty">No trades yet. Be the first: buy the fund with USDC, or swap through it.</p>
      )}
      {error && (
        <p className="alert" role="alert">
          Could not read activity from Arc. {error}
        </p>
      )}
      {loading && <p className="muted">Reading events from Arc testnet…</p>}
      {!loading && older !== undefined && !allLoaded && (
        <button type="button" className="btn btn-outline" onClick={loadOlder}>
          Show older activity
        </button>
      )}
      {allLoaded && entries.length > 0 && <p className="muted small">That is everything since the fund launched.</p>}
    </section>
  )
}

function Row({ entry, me, now }: { entry: Entry; me?: Address; now: number }) {
  const l = entry.log
  let title: string
  let detail: string | undefined
  let gap = false

  if (l.eventName === 'Swapped') {
    const i = l.args.assetIn ?? 0
    const o = l.args.assetOut ?? 0
    gap = !!l.args.gapFee
    title = `Swapped ${amount(l.args.amountIn ?? 0n, ASSETS[i].decimals)} ${ASSETS[i].symbol} for ${amount(l.args.amountOut ?? 0n, ASSETS[o].decimals)} ${ASSETS[o].symbol}`
    detail = gap
      ? `${usd(l.args.feeUsd ?? 0n)} to the fund, from the trader's ${usd(l.args.edgeUsd ?? 0n)} edge at Chainlink's prices.`
      : `Posted fee ${usd(l.args.feeUsd ?? 0n)}.`
  } else {
    const amounts = (l.eventName === 'Joined' ? l.args.amountsIn : l.args.amountsOut) ?? []
    const used = amounts.map((v, k) => [v, k] as const).filter(([v]) => v > 0n)
    const shares = `${amount(l.args.shares ?? 0n, 18)} BSKT`
    const assets =
      used.length === 1 ? `${amount(used[0][0], ASSETS[used[0][1]].decimals)} ${ASSETS[used[0][1]].symbol}` : 'all four assets'
    title = l.eventName === 'Joined' ? `Bought ${shares} with ${assets}` : `Sold ${shares} for ${assets}`
  }

  const mine = !!(me && entry.who && isAddressEqual(me, entry.who))
  const kind = l.eventName === 'Swapped' ? 'Swap' : l.eventName === 'Joined' ? 'Buy' : 'Sale'
  return (
    <li className={`entry${gap ? ' is-gap' : ''}`}>
      <div className="entry-head">
        <span className={`pill ${gap ? 'pill-gap' : 'pill-neutral'}`}>{gap ? 'Gap fee' : kind}</span>
        <p className="entry-title">{title}</p>
      </div>
      {detail && <p className="entry-detail">{detail}</p>}
      <p className="entry-meta">
        <span>
          {mine ? (
            <strong>You</strong>
          ) : entry.who ? (
            <a href={addressUrl(entry.who)} target="_blank" rel="noreferrer">
              {shortAddress(entry.who)}
            </a>
          ) : (
            'Through another router'
          )}
        </span>
        <span>{entry.time ? ago(Math.max(0, now / 1000 - entry.time)) : `Block ${l.blockNumber}`}</span>
        <a href={txUrl(entry.hash)} target="_blank" rel="noreferrer">
          View transaction
        </a>
      </p>
    </li>
  )
}
