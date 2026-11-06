// One swap through the basket: node scripts/swap.mjs USDC AAPL 0.5
import { formatUnits, parseUnits } from 'viem'
import { deployment as d, explorerTx, hookAbi, publicClient, routerAbi, walletClient } from './arc.mjs'

const symbols = ['NVDA', 'AAPL', 'MSFT', 'USDC']
const tokens = [d.nvda, d.aapl, d.msft, d.usdc]
const decimals = [18, 18, 18, 6]
const [from, to, amount] = process.argv.slice(2)
const i = symbols.indexOf(from?.toUpperCase())
const o = symbols.indexOf(to?.toUpperCase())
if (i < 0 || o < 0 || i === o || !amount) throw new Error('Usage: node scripts/swap.mjs USDC AAPL 0.5')

const wallet = walletClient()
const amountIn = parseUnits(amount, decimals[i])
const q = await publicClient.readContract({ address: d.hook, abi: hookAbi, functionName: 'quote', args: [i, o, amountIn] })
const key = await publicClient.readContract({ address: d.hook, abi: hookAbi, functionName: 'poolKey', args: [i, o] })
const zeroForOne = key.currency0.toLowerCase() === tokens[i].toLowerCase()
const minOut = (q.amountOut * 995n) / 1000n
const hash = await wallet.writeContract({
  address: d.router,
  abi: routerAbi,
  functionName: 'swapExactIn',
  args: [key, zeroForOne, amountIn, minOut, wallet.account.address],
})
const receipt = await publicClient.waitForTransactionReceipt({ hash })
console.log(`${amount} ${symbols[i]} -> ${formatUnits(q.amountOut, decimals[o])} ${symbols[o]} (${receipt.status})`)
console.log(`fee $${formatUnits(q.feeUsd, 18)} ${q.gapFee ? '(gap fee, all to the fund)' : '(posted fee, 90% fund / 10% protocol)'}`)
console.log(explorerTx(hash))
