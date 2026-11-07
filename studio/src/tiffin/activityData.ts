import { decodeEventLog, type Hex } from 'viem'
import { logsBlockdaemon, logsPublicRpc, publicClient } from './chain'
import { CHAIN_ID, EXPLORER, HOOK, hookAbi } from './config'
import { retryQuietly } from './retry'

export type Raw =
  | { kind: 'Swap'; assetIn: string; assetOut: string; amountIn: bigint; amountOut: bigint; feeOut: bigint; protocolFee: bigint; edgeUsd: bigint; gapFee: bigint }
  | { kind: 'Joined'; account: string; shares: bigint; amounts: readonly bigint[] }
  | { kind: 'Exited'; account: string; shares: bigint; amounts: readonly bigint[] }

export interface Item {
  id: string
  block: bigint
  logIndex: number
  hash: string
  from?: string
  timestamp?: number
  raw: Raw
}

/** Only the hook's three trade events. Anything else the explorer returns for the address is skipped. */
export const EVENTS = hookAbi.filter((x) => x.type === 'event' && (x.name === 'Swap' || x.name === 'Joined' || x.name === 'Exited'))

interface LogLike {
  eventName?: string
  args?: unknown
  blockNumber: bigint
  logIndex: number
  transactionHash: string
}

export function toItem(l: LogLike, timestamp?: number): Item | null {
  const args = l.args as Record<string, unknown>
  const base = { id: `${l.transactionHash}-${l.logIndex}`, block: l.blockNumber, logIndex: l.logIndex, hash: l.transactionHash, timestamp }
  if (l.eventName === 'Swap') return { ...base, raw: { kind: 'Swap', ...(args as Omit<Extract<Raw, { kind: 'Swap' }>, 'kind'>) } }
  if (l.eventName === 'Joined') return { ...base, raw: { kind: 'Joined', ...(args as Omit<Extract<Raw, { kind: 'Joined' }>, 'kind'>) } }
  if (l.eventName === 'Exited') return { ...base, raw: { kind: 'Exited', ...(args as Omit<Extract<Raw, { kind: 'Exited' }>, 'kind'>) } }
  return null
}

export function sortItems(list: Item[]): Item[] {
  return [...list].sort((a, b) => (a.block === b.block ? b.logIndex - a.logIndex : a.block > b.block ? -1 : 1))
}

/** Adds `fresh` to `prev` by id, keeping what the older copy already knew (sender, time). Newest first. */
export function mergeItems(prev: Item[], fresh: Item[]): Item[] {
  const map = new Map(prev.map((i) => [i.id, i]))
  for (const n of fresh) {
    const old = map.get(n.id)
    map.set(n.id, old ? { ...n, from: n.from ?? old.from, timestamp: n.timestamp ?? old.timestamp } : n)
  }
  return sortItems([...map.values()])
}

// ---------- three sources ----------

interface ExplorerLog {
  block_number: number
  block_timestamp: string | null
  transaction_hash: string
  index: number
  topics: (string | null)[]
  data: string
}
interface ExplorerPage {
  items: ExplorerLog[]
  next_page_params: Record<string, string | number> | null
}

const MAX_EXPLORER_PAGES = 40

/** The explorer's indexed logs for the hook, newest first, cut to blocks [from, to]. */
export async function explorerWindow(from: bigint, to: bigint, signal: AbortSignal): Promise<Item[]> {
  const out: Item[] = []
  // Start just below `to + 1`, so a deep window does not page through everything newer than it.
  let params = new URLSearchParams({ block_number: String(to + 1n), index: '0' })
  for (let page = 0; page < MAX_EXPLORER_PAGES; page++) {
    const res = await fetch(`${EXPLORER}/api/v2/addresses/${HOOK}/logs?${params}`, { signal, headers: { accept: 'application/json' } })
    if (!res.ok) throw new Error(`Explorer answered ${res.status}`)
    const body = (await res.json()) as ExplorerPage
    let reachedFloor = false
    for (const log of body.items) {
      const block = BigInt(log.block_number)
      if (block > to) continue
      if (block < from) {
        reachedFloor = true
        break
      }
      const topics = log.topics.filter((t): t is string => !!t) as Hex[]
      if (topics.length === 0) continue
      try {
        // The explorer's own "decoded" field guesses the wrong event, so decode with our ABI.
        const ev = decodeEventLog({ abi: EVENTS, data: log.data as Hex, topics: topics as [Hex, ...Hex[]], strict: false })
        const stamp = log.block_timestamp ? Math.floor(Date.parse(log.block_timestamp) / 1000) : undefined
        const item = toItem({ eventName: ev.eventName, args: ev.args, blockNumber: block, logIndex: log.index, transactionHash: log.transaction_hash }, stamp !== undefined && Number.isFinite(stamp) ? stamp : undefined)
        if (item) out.push(item)
      } catch {
        /* not one of our events */
      }
    }
    if (reachedFloor || !body.next_page_params) break
    params = new URLSearchParams(Object.entries(body.next_page_params).map(([k, v]) => [k, String(v)]))
  }
  return out
}

type LogsClient = typeof logsBlockdaemon

async function rpcWindow(client: LogsClient, from: bigint, to: bigint): Promise<Item[]> {
  const logs = await client.getLogs({ address: HOOK, events: EVENTS, fromBlock: from, toBlock: to })
  return logs.map((l) => toItem(l as unknown as LogLike)).filter((x): x is Item => !!x)
}

/** Resolves with the first source that answers; rejects only when every source has failed. */
function firstGood<T>(runs: (() => Promise<T>)[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let failed = 0
    let last: unknown
    for (const run of runs) {
      run().then(resolve, (e: unknown) => {
        last = e
        failed += 1
        if (failed === runs.length) reject(last instanceof Error ? last : new Error(String(last)))
      })
    }
  })
}

/**
 * Events in blocks [from, to], from the explorer API, Blockdaemon and the public RPC at the same time. The first good
 * answer wins and the rest are dropped. Each source retries itself quietly before it counts as failed.
 */
export async function readWindow(from: bigint, to: bigint): Promise<Item[]> {
  const ctl = new AbortController()
  const stop = () => ctl.signal.aborted
  try {
    return await firstGood<Item[]>([
      () => retryQuietly(() => explorerWindow(from, to, ctl.signal), 3, 1500, stop),
      () => retryQuietly(() => rpcWindow(logsBlockdaemon, from, to), 3, 1500, stop),
      () => retryQuietly(() => rpcWindow(logsPublicRpc, from, to), 3, 1500, stop),
    ])
  } finally {
    ctl.abort()
  }
}

/** The chain head, from whichever endpoint answers first. */
export function latestBlock(): Promise<bigint> {
  return firstGood<bigint>([
    () => retryQuietly(() => publicClient.getBlockNumber()),
    () => retryQuietly(() => logsBlockdaemon.getBlockNumber()),
    () => retryQuietly(() => logsPublicRpc.getBlockNumber()),
  ])
}

// ---------- saved rows ----------

export interface SavedActivity {
  items: Item[]
  /** The block the next "Load older" continues from. */
  cursor: bigint | null
  done: boolean
  /** The head block of the last successful scan. */
  top: bigint | null
}

const CACHE_KEY = `tiffin-activity-v1:${CHAIN_ID}:${HOOK.toLowerCase()}`

// bigint has no JSON form, so it is stored as { __big: "123" }.
const replacer = (_k: string, v: unknown) => (typeof v === 'bigint' ? { __big: v.toString() } : v)
const reviver = (_k: string, v: unknown) => (v && typeof v === 'object' && '__big' in v ? BigInt((v as { __big: string }).__big) : v)

export function loadSaved(): SavedActivity | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const j = JSON.parse(raw, reviver) as SavedActivity
    if (!Array.isArray(j.items)) return null
    const items = j.items.filter((i) => i && typeof i.id === 'string' && typeof i.block === 'bigint' && i.raw && typeof i.raw.kind === 'string')
    return { items: sortItems(items), cursor: typeof j.cursor === 'bigint' ? j.cursor : null, done: !!j.done, top: typeof j.top === 'bigint' ? j.top : null }
  } catch {
    return null
  }
}

export function saveActivity(s: SavedActivity): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(s, replacer))
  } catch {
    /* storage full or blocked */
  }
}
