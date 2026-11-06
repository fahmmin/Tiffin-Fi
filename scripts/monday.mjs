// Live Monday replay on Arc testnet.
//   node scripts/monday.mjs        Chainlink's price for Nvidia jumps GAP_PCT (default 5%) above the pool's price,
//                                  then a bot buys the gap through the router. The hook keeps 80% of its edge.
//   node scripts/monday.mjs reset  Reports today's real prices again and trades the pool back to them.
// The owner pushes the report here; in production the Chainlink CRE workflow writes the same report.
import { encodeAbiParameters, formatUnits } from 'viem'
import { clockAbi, deployment as d, explorerTx, hookAbi, publicClient, routerAbi, walletClient } from './arc.mjs'

const [NVDA, USDC] = [0, 3]
const wallet = walletClient()
const me = wallet.account.address
const read = (address, abi, functionName, args = []) => publicClient.readContract({ address, abi, functionName, args })

async function send(address, abi, functionName, args) {
  const hash = await wallet.writeContract({ address, abi, functionName, args })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`${functionName} reverted: ${explorerTx(hash)}`)
  return hash
}

function isqrt(n) {
  if (n < 2n) return n
  let x = n
  let y = (x + 1n) / 2n
  while (y < x) {
    x = y
    y = (x + n / x) / 2n
  }
  return x
}

async function yahooPrice(symbol) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=1d`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  const price = (await res.json()).chart.result[0].meta.regularMarketPrice
  return BigInt(Math.round(price * 1e6)) * 10n ** 12n
}

async function report(prices, open) {
  const payload = encodeAbiParameters([{ type: 'uint256[]' }, { type: 'bool' }], [prices, open])
  return send(d.clock, clockAbi, 'push', [payload])
}

/// Trades the NVDA/USDC curve to `target` (USD, 18 decimals), like an arbitrage bot would.
async function arbTo(target) {
  const r = await read(d.hook, hookAbi, 'reserves')
  const k = r[USDC] * r[NVDA]
  const pool = await read(d.hook, hookAbi, 'poolPriceUsd', [NVDA])
  const buying = target > pool
  const [assetIn, assetOut] = buying ? [USDC, NVDA] : [NVDA, USDC]
  // Equal weights: pool price = usdc * 1e12 / nvda, and usdc * nvda = k.
  const amountIn = buying ? isqrt((k * target) / 10n ** 30n) - r[USDC] : isqrt((k * 10n ** 30n) / target) - r[NVDA]
  const q = await read(d.hook, hookAbi, 'quote', [assetIn, assetOut, amountIn])
  const key = await read(d.hook, hookAbi, 'poolKey', [NVDA, USDC])
  const tokenIn = buying ? d.usdc : d.nvda
  const zeroForOne = key.currency0.toLowerCase() === tokenIn.toLowerCase()
  const capturedBefore = await read(d.hook, hookAbi, 'gapCapturedUsd')
  const hash = await send(d.router, routerAbi, 'swapExactIn', [key, zeroForOne, amountIn, 0n, me])
  const captured = (await read(d.hook, hookAbi, 'gapCapturedUsd')) - capturedBefore
  console.log(`bot ${buying ? 'buys' : 'sells'} NVDA: ${explorerTx(hash)}`)
  console.log(`  edge at Chainlink's price $${formatUnits(q.edgeUsd, 18)}, gap fee applied: ${q.gapFee}`)
  console.log(`  fund kept $${formatUnits(captured, 18)}, bot kept $${formatUnits(q.edgeUsd - captured, 18)}`)
  console.log(`  pool NVDA now $${formatUnits(await read(d.hook, hookAbi, 'poolPriceUsd', [NVDA]), 18)}`)
}

const prices = []
for (const stock of [d.nvda, d.aapl, d.msft]) prices.push((await read(d.clock, clockAbi, 'priceOf', [stock]))[0])
const open = await read(d.clock, clockAbi, 'marketOpen')

if (process.argv[2] === 'reset') {
  const real = [await yahooPrice('NVDA'), await yahooPrice('AAPL'), await yahooPrice('MSFT')]
  console.log(`report real prices: ${explorerTx(await report(real, open))}`)
  await arbTo(real[0])
} else {
  const gapPct = Number(process.env.GAP_PCT ?? '5')
  const pool = await read(d.hook, hookAbi, 'poolPriceUsd', [NVDA])
  console.log(`Friday: pool prices NVDA at $${formatUnits(pool, 18)}`)
  prices[0] = (pool * BigInt(Math.round((100 + gapPct) * 100))) / 10_000n
  console.log(`Monday open, Chainlink says $${formatUnits(prices[0], 18)}: ${explorerTx(await report(prices, open))}`)
  await arbTo(prices[0])
}
const [nav] = await read(d.hook, hookAbi, 'navUsd')
console.log(`fund value $${formatUnits(nav, 18)}, total gap captured $${formatUnits(await read(d.hook, hookAbi, 'gapCapturedUsd'), 18)}`)
