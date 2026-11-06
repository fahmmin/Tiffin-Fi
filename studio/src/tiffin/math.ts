import { ASSETS, SINGLE_ASSET_CAP_BPS } from './config'
import { WAD } from './format'

const BPS = 10_000n

export function isqrt(n: bigint): bigint {
  if (n < 2n) return n
  let x = n
  let y = (x + 1n) / 2n
  while (y < x) {
    x = y
    y = (x + n / x) / 2n
  }
  return x
}

const sqrtWad = (v: bigint) => isqrt(v * WAD)

/** USD18 value of `amount` of asset `i` at reference prices. */
export function valueUsd(i: number, amount: bigint, refPrices: readonly bigint[]): bigint {
  return (amount * refPrices[i]) / 10n ** BigInt(ASSETS[i].decimals)
}

export function mulDivUp(a: bigint, b: bigint, d: bigint): bigint {
  return (a * b + d - 1n) / d
}

export interface JoinEstimate {
  shares: bigint
  capBound: boolean
  maxIn: bigint
  overCap: boolean
}

/** Mirror of BasketHook.joinSingle (USDC in). */
export function estimateJoinSingle(args: {
  amountIn: bigint
  reserve: bigint
  supply: bigint
  nav: bigint
  postedBps: number
  refPrices: readonly bigint[]
  asset: number
}): JoinEstimate {
  const { amountIn, reserve, supply, nav, postedBps, refPrices, asset } = args
  const maxIn = (reserve * SINGLE_ASSET_CAP_BPS) / BPS
  if (reserve === 0n || supply === 0n || amountIn === 0n) return { shares: 0n, capBound: false, maxIn, overCap: false }
  const overCap = amountIn > maxIn
  const effIn = amountIn - (amountIn * BigInt(postedBps) * 3n) / 40_000n
  const x = ((reserve + effIn) * WAD) / reserve
  const root4 = sqrtWad(sqrtWad(x))
  let shares = (supply * (root4 - WAD)) / WAD
  let capBound = false
  if (nav > 0n) {
    const cap = (valueUsd(asset, amountIn, refPrices) * supply) / nav
    if (cap < shares) {
      shares = cap
      capBound = true
    }
  }
  return { shares, capBound, maxIn, overCap }
}

export interface ExitEstimate {
  out: bigint
  grossOut: bigint
  fee: bigint
  maxOut: bigint
  overCap: boolean
}

/** Mirror of BasketHook.exitSingle (USDC out). */
export function estimateExitSingle(args: {
  shares: bigint
  reserve: bigint
  supply: bigint
  nav: bigint
  postedBps: number
  refPrices: readonly bigint[]
  asset: number
}): ExitEstimate {
  const { shares, reserve, supply, nav, postedBps, refPrices, asset } = args
  const maxOut = (reserve * SINGLE_ASSET_CAP_BPS) / BPS
  if (reserve === 0n || supply === 0n || shares === 0n || shares > supply) {
    return { out: 0n, grossOut: 0n, fee: 0n, maxOut, overCap: false }
  }
  const r = ((supply - shares) * WAD) / supply
  const r2 = (r * r) / WAD
  const r4 = (r2 * r2) / WAD
  let out = (reserve * (WAD - r4)) / WAD
  const usd = (shares * nav) / supply
  const capByValue = (usd * 10n ** BigInt(ASSETS[asset].decimals)) / refPrices[asset]
  if (capByValue < out) out = capByValue
  const overCap = out > maxOut
  const fee = mulDivUp(out, BigInt(postedBps) * 3n, 40_000n)
  return { out: out - fee, grossOut: out, fee, maxOut, overCap }
}

/** Percent by which `got` is worth less than `paid` (both USD18). Positive means a loss. */
export function lossPct(paidUsd: bigint, gotUsd: bigint): number {
  if (paidUsd <= 0n) return 0
  const diff = paidUsd - gotUsd
  return (Number(diff) / Number(paidUsd)) * 100
}
