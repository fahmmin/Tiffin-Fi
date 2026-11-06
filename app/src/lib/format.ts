import { formatUnits, parseUnits, type Address } from 'viem'

const num = (v: bigint, decimals = 18) => Number(formatUnits(v, decimals))

/**
 * USD from an 18-decimal value. The fund is tiny on testnet, so precision follows size:
 * $16.20, $0.4098, $0.00195.
 */
export function usd(v: bigint, decimals = 18): string {
  const n = num(v, decimals)
  const a = Math.abs(n)
  const opts: Intl.NumberFormatOptions =
    a === 0 || a >= 1
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : a >= 0.01
        ? { minimumFractionDigits: 4, maximumFractionDigits: 4 }
        : { maximumSignificantDigits: 3 }
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', ...opts })
}

/** Share price: always four decimals, so fee growth shows. */
export const sharePrice = (v: bigint) =>
  num(v).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 4 })

/** Token amount: four decimals above 1, four significant digits below. */
export function amount(v: bigint, decimals: number): string {
  const n = num(v, decimals)
  if (n === 0) return '0'
  return n.toLocaleString('en-US', Math.abs(n) >= 1 ? { maximumFractionDigits: 4 } : { maximumSignificantDigits: 4 })
}

export const percent = (x: number, digits = 2) =>
  x.toLocaleString('en-US', { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits })

export const bps = (b: bigint | number) => percent(Number(b) / 10_000)

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/** "less than a minute ago", "3 minutes ago", "2 hours ago". */
export function ago(seconds: number): string {
  if (seconds < 60) return 'less than a minute ago'
  if (seconds < 3_600) return rtf.format(-Math.floor(seconds / 60), 'minute')
  if (seconds < 86_400) return rtf.format(-Math.floor(seconds / 3_600), 'hour')
  return rtf.format(-Math.floor(seconds / 86_400), 'day')
}

export const shortAddress = (a: Address) => `${a.slice(0, 6)}…${a.slice(-4)}`

/** Clock time in a city, e.g. "11:52 am". */
export const cityTime = (timeZone: string, date = new Date()) =>
  date.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).toLowerCase()

/** Parses what someone typed into an amount field. Undefined for empty or invalid input. */
export function parseAmount(input: string, decimals: number): bigint | undefined {
  const s = input.trim()
  if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') return undefined
  const [, frac = ''] = s.split('.')
  if (frac.length > decimals) return undefined
  return parseUnits(s, decimals)
}
