import { formatUnits } from 'viem'
import { ASSETS } from './config'

export const WAD = 10n ** 18n

/** Convert a raw bigint with `decimals` into a JS number (display only, never for money maths). */
export function toNumber(raw: bigint, decimals: number): number {
  return Number(formatUnits(raw, decimals))
}

/** USD with enough precision for a small fund: $0.0012, $48.01, $1,204.50. */
export function fmtUsdNum(n: number): string {
  if (!Number.isFinite(n)) return '$0.00'
  const abs = Math.abs(n)
  if (abs === 0) return '$0.00'
  let digits = 2
  if (abs < 0.0001) digits = 6
  else if (abs < 0.01) digits = 4
  else if (abs < 1) digits = 4
  else if (abs < 100) digits = 2
  const s = abs.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return `${n < 0 ? '-' : ''}$${s}`
}

/** USD18 fixed point -> display string. */
export function fmtUsd(usd18: bigint): string {
  return fmtUsdNum(toNumber(usd18, 18))
}

/** Share price needs four decimals ($0.9999). */
export function fmtSharePrice(usd18: bigint): string {
  const n = toNumber(usd18, 18)
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
}

/** Token amount with sensible precision: keeps at least 4 significant digits for tiny amounts. */
export function fmtToken(raw: bigint, decimals: number, maxDigits = 6): string {
  const n = toNumber(raw, decimals)
  if (n === 0) return '0'
  const abs = Math.abs(n)
  let digits = maxDigits
  if (abs >= 1000) digits = 2
  else if (abs >= 1) digits = 4
  else if (abs < 0.0001) digits = Math.min(10, Math.max(maxDigits, -Math.floor(Math.log10(abs)) + 3))
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits })
}

export function fmtShares(raw: bigint): string {
  return toNumber(raw, 18).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

export function fmtPct(n: number, digits = 2): string {
  return `${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`
}

export function fmtBps(bps: number | bigint): string {
  return `${(Number(bps) / 100).toFixed(2)}%`
}

export function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

export function timeIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(now)
}

export function ago(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.floor(seconds))} seconds ago`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.floor(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

/** Parse a user-typed decimal into raw units. Returns null for empty/invalid input. */
export function parseInput(value: string, decimals: number): bigint | null {
  const v = value.trim()
  if (!v || !/^\d*\.?\d*$/.test(v) || v === '.') return null
  const [whole, frac = ''] = v.split('.')
  if (frac.length > decimals) return null
  const raw = BigInt((whole || '0') + frac.padEnd(decimals, '0'))
  return raw
}

export function sanitizeInput(value: string, decimals: number): string {
  const cleaned = value.replace(/,/g, '.').replace(/[^0-9.]/g, '')
  const parts = cleaned.split('.')
  const head = parts[0]
  if (parts.length === 1) return head
  return `${head}.${parts.slice(1).join('').slice(0, decimals)}`
}

export const assetSymbol = (index: number) => ASSETS[index].symbol
