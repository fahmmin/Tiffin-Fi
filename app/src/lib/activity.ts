import { getAbiItem, type Address, type Hash } from 'viem'
import { hookAbi } from '../abi/hook.ts'
import { routerAbi } from '../abi/router.ts'
import { DEPLOY_BLOCK, HOOK, ROUTER, client } from '../config.ts'

const EVENTS = [
  getAbiItem({ abi: hookAbi, name: 'Swapped' }),
  getAbiItem({ abi: hookAbi, name: 'Joined' }),
  getAbiItem({ abi: hookAbi, name: 'Exited' }),
  // The router's event names the trader; the hook's Swapped only names the router.
  getAbiItem({ abi: routerAbi, name: 'Routed' }),
] as const

/** The public RPC answers at most 10,000 blocks per getLogs; stay under it. */
const CHUNK = 9_000n

const fetchRange = (fromBlock: bigint, toBlock: bigint) =>
  client.getLogs({ address: [HOOK, ROUTER], events: EVENTS, fromBlock, toBlock })

export type Log = Awaited<ReturnType<typeof fetchRange>>[number]

const isBasketEvent = (l: Log) => l.eventName !== 'Routed'

/**
 * Pages backwards from `to` until `want` basket events are found, the deploy block is reached, or `maxPages`
 * chunks have been read. `next` is where the following page would end; below DEPLOY_BLOCK means all history.
 */
export async function loadBackwards(to: bigint, want: number, maxPages = 8) {
  const logs: Log[] = []
  let cursor = to
  for (let page = 0; page < maxPages && cursor >= DEPLOY_BLOCK; page++) {
    const from = cursor - CHUNK + 1n > DEPLOY_BLOCK ? cursor - CHUNK + 1n : DEPLOY_BLOCK
    logs.push(...(await fetchRange(from, cursor)))
    cursor = from - 1n
    if (logs.filter(isBasketEvent).length >= want) break
  }
  return { logs, next: cursor }
}

/** New logs from `from` to `to`, in chunks. */
export async function loadForwards(from: bigint, to: bigint) {
  const logs: Log[] = []
  for (let start = from; start <= to; start += CHUNK) {
    const end = start + CHUNK - 1n < to ? start + CHUNK - 1n : to
    logs.push(...(await fetchRange(start, end)))
  }
  return logs
}

export type Entry = {
  id: string
  log: Exclude<Log, { eventName: 'Routed' }>
  hash: Hash
  /** Unix seconds; Arc's RPC includes blockTimestamp on logs. */
  time?: number
  who?: Address
}

/** Basket events, newest first, with the trader filled in from the router's event in the same transaction. */
export function toEntries(logs: Iterable<Log>): Entry[] {
  const all = [...logs]
  const traders = new Map<string, Address>()
  for (const l of all) if (l.eventName === 'Routed' && l.transactionHash) traders.set(l.transactionHash, l.args.trader!)
  const entries: Entry[] = []
  for (const l of all) {
    if (l.eventName === 'Routed' || !l.transactionHash) continue
    const ts = (l as { blockTimestamp?: string }).blockTimestamp
    entries.push({
      id: logId(l),
      log: l,
      hash: l.transactionHash,
      time: ts ? Number(ts) : undefined,
      who: l.eventName === 'Swapped' ? traders.get(l.transactionHash) : l.args.user,
    })
  }
  return entries.sort((a, b) => Number((b.log.blockNumber ?? 0n) - (a.log.blockNumber ?? 0n)) || (b.log.logIndex ?? 0) - (a.log.logIndex ?? 0))
}

export const logId = (l: Log) => `${l.transactionHash}-${l.logIndex}`
