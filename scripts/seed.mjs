// Seeds the fund with its first join: the stock slices the deploy script minted, plus SEED_USDC of Arc USDC.
// Sent straight to the chain because Arc's USDC checks a blocklist precompile Foundry can't simulate.
import { formatUnits } from 'viem'
import { deployment as d, erc20Abi, explorerTx, hookAbi, publicClient, walletClient } from './arc.mjs'

const wallet = walletClient()
const me = wallet.account.address

const supply = await publicClient.readContract({ address: d.hook, abi: hookAbi, functionName: 'totalSupply' })
if (supply !== 0n) {
  console.log(`Already seeded: ${formatUnits(supply, 18)} shares`)
  process.exit(0)
}

const amounts = []
for (const stock of [d.nvda, d.aapl, d.msft]) {
  amounts.push(await publicClient.readContract({ address: stock, abi: erc20Abi, functionName: 'balanceOf', args: [me] }))
}
amounts.push(BigInt(process.env.SEED_USDC ?? '4000000'))

const hash = await wallet.writeContract({ address: d.hook, abi: hookAbi, functionName: 'join', args: [amounts, 0n] })
const receipt = await publicClient.waitForTransactionReceipt({ hash })
const shares = await publicClient.readContract({ address: d.hook, abi: hookAbi, functionName: 'totalSupply' })
const [nav] = await publicClient.readContract({ address: d.hook, abi: hookAbi, functionName: 'navUsd' })
console.log(`join ${receipt.status}: ${explorerTx(hash)}`)
console.log(`shares ${formatUnits(shares, 18)}, fund value $${formatUnits(nav, 18)}`)
