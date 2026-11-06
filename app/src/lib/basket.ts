import { erc20Abi, parseAbi, zeroAddress, type Address } from 'viem'
import { clockAbi } from '../abi/clock.ts'
import { hookAbi } from '../abi/hook.ts'
import { ASSETS, CLOCK, HOOK, ROUTER, USDC, arc, client } from '../config.ts'

const hook = { address: HOOK, abi: hookAbi } as const
const clock = { address: CLOCK, abi: clockAbi } as const
const token = (i: number) => ({ address: ASSETS[i].token, abi: erc20Abi }) as const
// The block number rides in the same multicall, for the network status line.
const multicall3 = { address: arc.contracts.multicall3.address, abi: parseAbi(['function getBlockNumber() view returns (uint256)']) } as const

/** Everything the app shows, in one multicall. Without a wallet the user rows read the zero address and are dropped. */
export async function readFund(user: Address = zeroAddress) {
  const [
    [nav, fresh],
    sharePriceUsd,
    supply,
    reserves,
    postedFeeBps,
    maxPriceAge,
    totalFeesUsd,
    gapCapturedUsd,
    protocolEarnedUsd,
    swapCount,
    pool0,
    pool1,
    pool2,
    marketOpen,
    [ref0, at0],
    [ref1, at1],
    [ref2, at2],
    feeOpen,
    feeClosed,
    feeStale,
    gapShare,
    protocolShare,
    bskt,
    bal0,
    bal1,
    bal2,
    bal3,
    hookAllowance,
    allow0,
    allow1,
    allow2,
    allow3,
    block,
  ] = await client.multicall({
    allowFailure: false,
    batchSize: 8_192, // one eth_call: the public RPC rate-limits bursts
    contracts: [
      { ...hook, functionName: 'navUsd' },
      { ...hook, functionName: 'sharePriceUsd' },
      { ...hook, functionName: 'totalSupply' },
      { ...hook, functionName: 'reserves' },
      { ...hook, functionName: 'postedFeeBps' },
      { ...hook, functionName: 'maxPriceAge' },
      { ...hook, functionName: 'totalFeesUsd' },
      { ...hook, functionName: 'gapCapturedUsd' },
      { ...hook, functionName: 'protocolEarnedUsd' },
      { ...hook, functionName: 'swapCount' },
      { ...hook, functionName: 'poolPriceUsd', args: [0] },
      { ...hook, functionName: 'poolPriceUsd', args: [1] },
      { ...hook, functionName: 'poolPriceUsd', args: [2] },
      { ...clock, functionName: 'marketOpen' },
      { ...clock, functionName: 'priceOf', args: [ASSETS[0].token] },
      { ...clock, functionName: 'priceOf', args: [ASSETS[1].token] },
      { ...clock, functionName: 'priceOf', args: [ASSETS[2].token] },
      { ...hook, functionName: 'feeOpenBps' },
      { ...hook, functionName: 'feeClosedBps' },
      { ...hook, functionName: 'feeStaleBps' },
      { ...hook, functionName: 'gapShareBps' },
      { ...hook, functionName: 'protocolShareBps' },
      { ...hook, functionName: 'balanceOf', args: [user] },
      { ...token(0), functionName: 'balanceOf', args: [user] },
      { ...token(1), functionName: 'balanceOf', args: [user] },
      { ...token(2), functionName: 'balanceOf', args: [user] },
      { ...token(3), functionName: 'balanceOf', args: [user] },
      { ...token(USDC), functionName: 'allowance', args: [user, HOOK] },
      { ...token(0), functionName: 'allowance', args: [user, ROUTER] },
      { ...token(1), functionName: 'allowance', args: [user, ROUTER] },
      { ...token(2), functionName: 'allowance', args: [user, ROUTER] },
      { ...token(3), functionName: 'allowance', args: [user, ROUTER] },
      { ...multicall3, functionName: 'getBlockNumber' },
    ],
  })

  return {
    nav,
    fresh,
    sharePriceUsd,
    supply,
    reserves,
    postedFeeBps: Number(postedFeeBps),
    maxPriceAge,
    totalFeesUsd,
    gapCapturedUsd,
    protocolEarnedUsd,
    swapCount: Number(swapCount),
    poolPrices: [pool0, pool1, pool2],
    refPrices: [ref0, ref1, ref2],
    /** Oldest of the three Chainlink CRE price updates, unix seconds. */
    pricesUpdatedAt: Math.min(Number(at0), Number(at1), Number(at2)),
    marketOpen,
    fees: { open: feeOpen, closed: feeClosed, stale: feeStale, gapShare, protocolShare },
    user:
      user === zeroAddress
        ? undefined
        : {
            address: user,
            bskt,
            balances: [bal0, bal1, bal2, bal3],
            hookAllowance,
            routerAllowances: [allow0, allow1, allow2, allow3],
          },
    block,
    readAt: Date.now(),
  }
}

export type Fund = Awaited<ReturnType<typeof readFund>>

/** USD value (18 decimals) of `amount` of asset `i` at Chainlink's reference price, the way navUsd() counts it. */
export function valueUsd(f: Fund, i: number, amount: bigint): bigint {
  if (i === USDC) return amount * 10n ** 12n
  return (amount * f.refPrices[i]) / 10n ** 18n
}

/** Minimum to accept: the preview minus 0.5%. */
export const withSlippage = (x: bigint) => (x * 995n) / 1000n

/** The hook rejects single-asset buys above 30% of the fund's USDC balance. */
export const maxBuyUsdc = (f: Fund) => (f.reserves[USDC] * 3n) / 10n

/**
 * Mirrors BasketHook._joinSingle for USDC. Used only before the USDC approval exists, because the exact
 * eth_call simulation needs the allowance; after approval the app shows the simulated amount instead.
 */
export function estimateBuyShares(f: Fund, usdcIn: bigint): bigint {
  const supply = Number(f.supply)
  // Three quarters of a single-asset buy is an implicit swap into the stocks, so it pays the posted fee.
  const effIn = Number(usdcIn) * (1 - (3 * f.postedFeeBps) / 40_000)
  // Balancer single-asset join with a 25% weight: supply * ((1 + in / balance) ^ (1/4) - 1)
  let shares = supply * Math.expm1(Math.log1p(effIn / Number(f.reserves[USDC])) / 4)
  if (f.fresh) shares = Math.min(shares, (supply * effIn * 1e12) / Number(f.nav)) // never above reference value
  return BigInt(Math.floor(shares))
}

/** The v4 pool key for a pair, built the way BasketHook.poolKey() builds it. */
export function poolKey(a: number, b: number) {
  const [x, y] = [ASSETS[a].token, ASSETS[b].token]
  const [currency0, currency1] = BigInt(x) < BigInt(y) ? [x, y] : [y, x]
  return { currency0, currency1, fee: 0, tickSpacing: 60, hooks: HOOK } as const
}
