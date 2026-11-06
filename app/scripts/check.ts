// Checks the app's read paths against live Arc testnet, plus its money formatting: npm run check
// Read-only: eth_call and getLogs only, no keys. Simulations use the deployer's public address as the sender
// because it already holds BSKT and has approved the hook.
import { formatUnits, isAddressEqual } from 'viem'
import { hookAbi } from '../src/abi/hook.ts'
import { ASSETS, HOOK, USDC, client } from '../src/config.ts'
import { loadBackwards, toEntries } from '../src/lib/activity.ts'
import { estimateBuyShares, maxBuyUsdc, poolKey, readFund, valueUsd } from '../src/lib/basket.ts'
import { amount, parseAmount, sharePrice, usd } from '../src/lib/format.ts'

const DEPLOYER = '0xcdadd0e1aae3a62ed588f66c33b4694ab9603cd2'

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(`FAIL: ${message}`)
  console.log(`ok  ${message}`)
}

// Formatting: the fund is tiny, so small values must keep their precision.
assert(usd(16_199_512_122_553_539_825n) === '$16.20', 'usd above $1 shows cents')
assert(usd(409_878_000_000_000_000n) === '$0.4099', 'usd under $1 shows four decimals')
assert(usd(1_951_509_785_838_607n) === '$0.00195', 'usd under a cent keeps three significant digits')
assert(usd(0n) === '$0.00', 'zero')
assert(sharePrice(1_012_469_507_659_596_239n) === '$1.0125', 'share price has four decimals')
assert(amount(20_696_108_552_167_166n, 18) === '0.0207', 'small token amount')
assert(amount(4_098_780n, 6) === '4.0988', 'usdc amount')
assert(parseAmount('1.5', 6) === 1_500_000n, 'parses decimals')
assert(parseAmount('0.0000001', 6) === undefined, 'rejects more decimals than the token has')
assert(parseAmount('1e3', 6) === undefined && parseAmount('', 6) === undefined && parseAmount('.', 6) === undefined, 'rejects junk')

// Live reads.
const f = await readFund(DEPLOYER)
console.log(
  `\nfund ${usd(f.nav)} (fresh ${f.fresh}), share ${sharePrice(f.sharePriceUsd)}, supply ${formatUnits(f.supply, 18)}, ` +
    `market ${f.marketOpen ? 'open' : 'closed'}, posted fee ${f.postedFeeBps} bps, swaps ${f.swapCount}`,
)
console.log(`prices updated ${Math.round(Date.now() / 1000 - f.pricesUpdatedAt)} s ago, max age ${f.maxPriceAge} s`)
ASSETS.forEach((a, i) =>
  console.log(
    `  ${a.symbol.padEnd(6)} ${amount(f.reserves[i], a.decimals).padStart(10)}  ${usd(valueUsd(f, i, f.reserves[i])).padStart(8)}` +
      (i < 3 ? `  pool ${usd(f.poolPrices[i])} vs Chainlink ${usd(f.refPrices[i])}` : ''),
  ),
)
console.log(
  `fees for holders ${usd(f.totalFeesUsd - f.protocolEarnedUsd)}, gap captured ${usd(f.gapCapturedUsd)}, protocol ${usd(f.protocolEarnedUsd)}\n`,
)

const sum = ASSETS.reduce((s, _, i) => s + valueUsd(f, i, f.reserves[i]), 0n)
assert(f.nav - sum >= 0n && f.nav - sum < 4n, 'navUsd equals the sum of the four slices')
assert(f.user && f.user.bskt > 0n && f.user.hookAllowance > 0n, 'user rows read for a connected address')

for (const [a, b] of [[0, 3], [1, 3], [2, 3], [0, 1], [1, 2], [0, 2]]) {
  const onchain = await client.readContract({ address: HOOK, abi: hookAbi, functionName: 'poolKey', args: [a, b] })
  const mine = poolKey(a, b)
  assert(
    isAddressEqual(onchain.currency0, mine.currency0) && isAddressEqual(onchain.currency1, mine.currency1) &&
      onchain.tickSpacing === mine.tickSpacing && onchain.fee === mine.fee,
    `pool key ${ASSETS[a].symbol}/${ASSETS[b].symbol} matches the hook`,
  )
}

const buy = maxBuyUsdc(f) < 500_000n ? maxBuyUsdc(f) / 2n : 500_000n
const { result: simShares } = await client.simulateContract({
  address: HOOK,
  abi: hookAbi,
  functionName: 'joinSingle',
  args: [USDC, buy, 0n],
  account: DEPLOYER,
})
const estimate = estimateBuyShares(f, buy)
const drift = Math.abs(Number(estimate - simShares)) / Number(simShares)
console.log(`buy ${amount(buy, 6)} USDC: simulated ${formatUnits(simShares, 18)} BSKT, estimated ${formatUnits(estimate, 18)}`)
assert(drift < 1e-4, `pre-approval estimate within 0.01% of the joinSingle simulation (drift ${drift.toExponential(2)})`)

const tooBig = maxBuyUsdc(f) + 1n
const rejected = await client
  .simulateContract({ address: HOOK, abi: hookAbi, functionName: 'joinSingle', args: [USDC, tooBig, 0n], account: DEPLOYER })
  .then(() => false, (e: { walk: (fn: (x: unknown) => boolean) => { data?: { errorName?: string } } | null }) =>
    e.walk((x) => !!(x as { data?: { errorName?: string } }).data?.errorName)?.data?.errorName === 'TooLarge',
  )
assert(rejected, `a buy above the 30% cap (${amount(tooBig, 6)} USDC) reverts with TooLarge`)

const { result: usdcOut } = await client.simulateContract({
  address: HOOK,
  abi: hookAbi,
  functionName: 'exitSingle',
  args: [USDC, 10n ** 17n, 0n],
  account: DEPLOYER,
})
assert(usdcOut > 0n, `selling 0.1 BSKT simulates to ${amount(usdcOut, 6)} USDC`)

const q = await client.readContract({ address: HOOK, abi: hookAbi, functionName: 'quote', args: [USDC, 0, 100_000n] })
console.log(
  `quote 0.1 USDC -> ${amount(q.amountOut, 18)} tNVDA, fee ${usd(q.feeUsd)} (${q.gapFee ? 'gap' : 'posted'}), edge ${usd(q.edgeUsd)}, fresh ${q.fresh}`,
)
assert(q.amountOut > 0n, 'quote returns an amount out')

// Activity: page back from the head, as the Activity view does.
const latest = await client.getBlockNumber()
const page = await loadBackwards(latest, 25)
const entries = toEntries(page.logs)
console.log(`\nactivity: ${entries.length} events from ${page.logs.length} logs, next page ends at block ${page.next}`)
for (const e of entries.slice(0, 6)) {
  const age = e.time ? `${Math.round(Date.now() / 1000 - e.time)} s ago` : 'no time'
  console.log(`  ${e.log.eventName.padEnd(7)} ${e.who ?? 'unknown'}  ${age}  ${e.hash.slice(0, 12)}${e.log.eventName === 'Swapped' && e.log.args.gapFee ? '  gap fee' : ''}`)
}
assert(entries.length > 0 && entries.every((e) => e.time), 'activity has events with block timestamps')
assert(
  entries.filter((e) => e.log.eventName === 'Swapped').every((e) => e.who),
  'every swap through the basket router names its trader',
)
console.log('\nAll checks passed.')
