import { logsClient, publicClient } from './chain'
import { HOOK, LOG_CHUNK, SEED_BLOCK, hookAbi } from './config'

/** One point in the fund's history, read from chain state at a past block. */
export interface Sample {
  block: bigint
  time: number
  nav: bigint
  supply: bigint
  fees: bigint
  gap: bigint
}

export interface SwapRow {
  block: bigint
  time: number
  assetIn: string
  amountIn: bigint
}

export const SAMPLE_COUNT = 40
const STORE_KEY = 'tiffin-history-v2'

interface Store {
  samples: Sample[]
  loading: Promise<Sample[]> | null
}

const store: Store = { samples: [], loading: null }

// Restore what an earlier visit in this tab already read.
try {
  const raw = sessionStorage.getItem(STORE_KEY)
  if (raw) {
    const j = JSON.parse(raw) as { samples: Record<string, string | number>[] }
    store.samples = j.samples.map((s) => ({
      block: BigInt(s.block),
      time: Number(s.time),
      nav: BigInt(s.nav),
      supply: BigInt(s.supply),
      fees: BigInt(s.fees),
      gap: BigInt(s.gap),
    }))
  }
} catch {
  /* no session cache */
}

function persist() {
  try {
    sessionStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        samples: store.samples.map((s) => ({ ...s, block: String(s.block), nav: String(s.nav), supply: String(s.supply), fees: String(s.fees), gap: String(s.gap) })),
      }),
    )
  } catch {
    /* storage full or blocked */
  }
}

export function cachedSamples(): Sample[] {
  return store.samples
}

async function sampleAt(blockNumber: bigint): Promise<Sample | null> {
  const hook = { address: HOOK, abi: hookAbi } as const
  const [res, block] = await Promise.all([
    publicClient.multicall({
      blockNumber,
      allowFailure: true,
      contracts: [
        { ...hook, functionName: 'navUsd' },
        { ...hook, functionName: 'totalSupply' },
        { ...hook, functionName: 'totalFeesUsd' },
        { ...hook, functionName: 'gapCapturedUsd' },
      ],
    }),
    publicClient.getBlock({ blockNumber }),
  ])
  const [nav, supply, fees, gap] = res
  if (nav.status !== 'success' || supply.status !== 'success' || fees.status !== 'success' || gap.status !== 'success') return null
  if (supply.result === 0n) return null
  return { block: blockNumber, time: Number(block.timestamp), nav: nav.result[0], supply: supply.result, fees: fees.result, gap: gap.result }
}

/**
 * About 40 block heights spaced evenly from the seed to the latest block, each read with one multicall at that
 * block. Cached for the session; the page adds the newest point itself on every refresh.
 */
export function loadSamples(latest: bigint): Promise<Sample[]> {
  if (store.samples.length >= 2) return Promise.resolve(store.samples)
  if (store.loading) return store.loading
  store.loading = (async () => {
    const seed = SEED_BLOCK
    const span = latest > seed ? latest - seed : 0n
    const heights = Array.from({ length: SAMPLE_COUNT }, (_, i) => seed + (span * BigInt(i)) / BigInt(SAMPLE_COUNT - 1))
    const unique = [...new Set(heights.map(String))].map(BigInt)
    const got = await Promise.all(unique.map((h) => sampleAt(h).catch(() => null)))
    const samples = got.filter((s): s is Sample => !!s).sort((a, b) => (a.block < b.block ? -1 : 1))
    if (samples.length < 2) throw new Error('History not available')
    store.samples = samples
    persist()
    return samples
  })().finally(() => {
    store.loading = null
  })
  return store.loading
}

// ---------- swap volume ----------

const swapStore = {
  scannedTo: null as bigint | null,
  rows: [] as SwapRow[],
  stamps: new Map<bigint, number>(),
  running: null as Promise<SwapRow[]> | null,
}

const LOG_CONCURRENCY = 6
const SWAP_EVENT = hookAbi.filter((x) => x.type === 'event' && x.name === 'Swap')

export function cachedSwaps(): SwapRow[] {
  return swapStore.rows
}

/** Reads Swap events from the seed to `latest` in chunks of at most 9,000 blocks, up to six requests at a time. */
export function loadSwaps(latest: bigint): Promise<SwapRow[]> {
  if (swapStore.running) return swapStore.running
  swapStore.running = (async () => {
    const start = swapStore.scannedTo !== null ? swapStore.scannedTo + 1n : SEED_BLOCK
    if (start > latest) return swapStore.rows
    const ranges: [bigint, bigint][] = []
    for (let from = start; from <= latest; from += LOG_CHUNK) {
      const to = from + LOG_CHUNK - 1n > latest ? latest : from + LOG_CHUNK - 1n
      ranges.push([from, to])
    }
    const found: { block: bigint; assetIn: string; amountIn: bigint }[] = []
    // A small pool: as soon as one request finishes the next range starts, so six are always in flight.
    let next = 0
    const worker = async () => {
      while (next < ranges.length) {
        const [fromBlock, toBlock] = ranges[next++]
        const logs = await logsClient.getLogs({ address: HOOK, events: SWAP_EVENT, fromBlock, toBlock })
        for (const l of logs) {
          const a = (l as unknown as { args: { assetIn: string; amountIn: bigint }; blockNumber: bigint }).args
          found.push({ block: (l as unknown as { blockNumber: bigint }).blockNumber, assetIn: a.assetIn, amountIn: a.amountIn })
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(LOG_CONCURRENCY, ranges.length) }, worker))
    const blocks = [...new Set(found.map((f) => f.block))].filter((b) => !swapStore.stamps.has(b))
    await Promise.all(
      blocks.map((b) =>
        publicClient
          .getBlock({ blockNumber: b })
          .then((x) => swapStore.stamps.set(b, Number(x.timestamp)))
          .catch(() => undefined),
      ),
    )
    for (const f of found) {
      const time = swapStore.stamps.get(f.block)
      if (time !== undefined) swapStore.rows.push({ ...f, time })
    }
    swapStore.scannedTo = latest
    return swapStore.rows
  })().finally(() => {
    swapStore.running = null
  })
  return swapStore.running
}
