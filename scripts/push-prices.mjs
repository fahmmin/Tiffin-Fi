// Owner fallback for the Chainlink CRE workflow: fetch NVDA, AAPL and MSFT prices, work out NYSE hours and push the
// same report to MarketClock.  node scripts/push-prices.mjs            one report
//                              node scripts/push-prices.mjs --every 5  one report every 5 minutes
import { encodeAbiParameters, formatUnits } from 'viem'
import { clockAbi, deployment as d, explorerTx, publicClient, walletClient } from './arc.mjs'
import { nyseOpen } from './nyse.mjs'

async function price(symbol) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=1d`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  if (!res.ok) throw new Error(`${symbol} price request failed: ${res.status}`)
  const value = (await res.json()).chart.result[0].meta.regularMarketPrice
  return BigInt(Math.round(value * 1e6)) * 10n ** 12n
}

async function pushOnce(wallet) {
  const prices = [await price('NVDA'), await price('AAPL'), await price('MSFT')]
  const open = nyseOpen()
  const report = encodeAbiParameters([{ type: 'uint256[]' }, { type: 'bool' }], [prices, open])
  const hash = await wallet.writeContract({ address: d.clock, abi: clockAbi, functionName: 'push', args: [report] })
  await publicClient.waitForTransactionReceipt({ hash })
  const shown = prices.map((p) => `$${Number(formatUnits(p, 18)).toFixed(2)}`).join(' / ')
  console.log(`${new Date().toISOString()} NVDA/AAPL/MSFT ${shown}, market ${open ? 'open' : 'closed'}: ${explorerTx(hash)}`)
}

const every = process.argv.indexOf('--every')
const wallet = walletClient()
await pushOnce(wallet)
if (every > 0) {
  const minutes = Number(process.argv[every + 1] ?? '5')
  setInterval(() => pushOnce(wallet).catch((e) => console.error(e.shortMessage ?? e.message)), minutes * 60_000)
}
