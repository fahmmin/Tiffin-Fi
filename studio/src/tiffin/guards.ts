/** Limits that keep a trade from doing something the user would regret. */

/** Arc pays gas in USDC, from the same balance, so a trade keeps this much back. 6 decimals. */
export const GAS_RESERVE_USDC = 50_000n
export const GAS_MESSAGE = 'Keep about 0.05 USDC for gas. Arc pays gas in USDC.'

/** The balance a user can spend on a USDC trade. */
export function spendableUsdc(balance: bigint): bigint {
  return balance > GAS_RESERVE_USDC ? balance - GAS_RESERVE_USDC : 0n
}

/** One trade may use at most 30% of the pool's reserve of the asset being paid. */
const CAP_BPS = 3000n

export function reserveCapMax(reserve: bigint): bigint {
  return (reserve * CAP_BPS) / 10_000n
}

export function overReserveCap(amount: bigint, reserve: bigint): boolean {
  return amount * 10_000n > reserve * CAP_BPS
}

/** A trade worth more than this much less than it costs, at Chainlink's prices, is blocked. */
export const LOSS_BLOCK_PCT = 10
/** Between this and the block level, a yellow warning shows. */
export const LOSS_WARN_PCT = 2
