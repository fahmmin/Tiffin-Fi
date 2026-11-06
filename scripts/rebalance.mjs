// Trades each stock's pool back to MarketClock's reference price, as arbitrage bots do on a live chain (testnet has
// none), then optionally grows the fund with a proportional join so demo-sized trades move prices less.
//   node scripts/rebalance.mjs                 rebalance only
//   TOPUP_USDC=8 node scripts/rebalance.mjs    rebalance, then add up to 8 USDC plus matching stock slices
import { formatUnits, parseAbi, parseUnits } from 'viem'
import { clockAbi, deployment as d, erc20Abi, explorerTx, hookAbi, publicClient, routerAbi, walletClient } from './arc.mjs'

const USDC = 3
const STOCKS = [d.nvda, d.aapl, d.msft]
const NAMES = ['NVDA', 'AAPL', 'MSFT']
const KEEP_FOR_GAS = parseUnits('4', 6)
const mintAbi = parseAbi(['function mint(address to, uint256 amount)'])

const wallet = walletClient()
const me = wallet.account.address
const read = (address, abi, functionName, args = []) => publicClient.readContract({ address, abi, functionName, args })
const usd = (x) => `$${Number(formatUnits(x, 18)).toFixed(2)}`

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

async function mintUpTo(i, amount) {
  const balance = await read(STOCKS[i], erc20Abi, 'balanceOf', [me])
  if (balance < amount) await send(STOCKS[i], mintAbi, 'mint', [me, amount - balance])
}

/// Swaps stock i against USDC until its pool price is the reference price. Returns false when already within 0.3%.
async function moveTo(i, target) {
  const r = await read(d.hook, hookAbi, 'reserves')
  const pool = await read(d.hook, hookAbi, 'poolPriceUsd', [i])
  if (Number(pool > target ? pool - target : target - pool) / Number(target) < 0.003) return false
  // Equal weights: pool price = usdc * 1e30 / stock (18-decimal USD), and usdc * stock stays k.
  const k = r[USDC] * r[i]
  const buying = target > pool
  const amountIn = buying ? isqrt((k * target) / 10n ** 30n) - r[USDC] : isqrt((k * 10n ** 30n) / target) - r[i]
  if (!buying) await mintUpTo(i, amountIn)
  const key = await read(d.hook, hookAbi, 'poolKey', [i, USDC])
  const tokenIn = buying ? d.usdc : STOCKS[i]
  const zeroForOne = key.currency0.toLowerCase() === tokenIn.toLowerCase()
  const q = await read(d.hook, hookAbi, 'quote', buying ? [USDC, i, amountIn] : [i, USDC, amountIn])
  const hash = await send(d.router, routerAbi, 'swapExactIn', [key, zeroForOne, amountIn, 0n, me])
  const fee = q.gapFee ? `gap fee ${usd(q.feeUsd)} to the fund` : `posted fee ${usd(q.feeUsd)}`
  console.log(`${NAMES[i]} pool ${usd(pool)} -> Chainlink ${usd(target)}: ${buying ? 'bought' : 'sold'} ${NAMES[i]}, ${fee}: ${explorerTx(hash)}`)
  return true
}

const targets = []
for (const stock of STOCKS) targets.push((await read(d.clock, clockAbi, 'priceOf', [stock]))[0])

for (let round = 1; round <= 4; round++) {
  let moved = false
  for (let i = 0; i < 3; i++) moved = (await moveTo(i, targets[i])) || moved
  if (!moved) break
}

const wanted = process.env.TOPUP_USDC ? parseUnits(process.env.TOPUP_USDC, 6) : 0n
if (wanted > 0n) {
  const balance = await read(d.usdc, erc20Abi, 'balanceOf', [me])
  const usdcIn = balance - KEEP_FOR_GAS < wanted ? balance - KEEP_FOR_GAS : wanted
  if (usdcIn <= 0n) throw new Error(`Only ${formatUnits(balance, 6)} USDC: get more from https://faucet.circle.com`)
  const r = await read(d.hook, hookAbi, 'reserves')
  const amounts = [0, 1, 2].map((i) => (r[i] * usdcIn * 1001n) / (r[USDC] * 1000n)) // a little extra so USDC sets the ratio
  for (let i = 0; i < 3; i++) await mintUpTo(i, amounts[i])
  const hash = await send(d.hook, hookAbi, 'join', [[...amounts, usdcIn], 0n])
  console.log(`added ${formatUnits(usdcIn, 6)} USDC and matching stock slices: ${explorerTx(hash)}`)
}

const [nav] = await read(d.hook, hookAbi, 'navUsd')
console.log(`fund value ${usd(nav)}, share price ${usd(await read(d.hook, hookAbi, 'sharePriceUsd'))}`)
for (let i = 0; i < 3; i++) {
  const pool = await read(d.hook, hookAbi, 'poolPriceUsd', [i])
  const off = ((Number(pool) / Number(targets[i]) - 1) * 100).toFixed(2)
  console.log(`  ${NAMES[i]} pool ${usd(pool)} vs Chainlink ${usd(targets[i])} (${off}%)`)
}
