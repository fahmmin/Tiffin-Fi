// Funds the throwaway e2e wallet from the deployer: Arc USDC (also its gas) and a few test shares to sell and swap.
// Needs PRIVATE_KEY (the deployer) and E2E_ADDRESS (from e2e/.env.e2e) in the environment.
import { formatUnits, parseAbi, parseUnits } from 'viem'
import { deployment as d, erc20Abi, explorerTx, publicClient, walletClient } from '../../scripts/arc.mjs'

const to = process.env.E2E_ADDRESS
if (!to) throw new Error('E2E_ADDRESS is missing: run npm run wallet first')
const usdc = parseUnits(process.env.E2E_USDC ?? '1.5', 6)
const wallet = walletClient()
const mintAbi = parseAbi(['function mint(address to, uint256 amount)', 'function transfer(address to, uint256 amount) returns (bool)'])

const deployerUsdc = await publicClient.readContract({ address: d.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [wallet.account.address] })
if (deployerUsdc - usdc < parseUnits('2', 6)) throw new Error(`Deployer has ${formatUnits(deployerUsdc, 6)} USDC; top up at https://faucet.circle.com`)

async function send(address, functionName, args) {
  const hash = await wallet.writeContract({ address, abi: mintAbi, functionName, args })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`${functionName} failed: ${explorerTx(hash)}`)
}

await send(d.usdc, 'transfer', [to, usdc])
for (const [stock, amount] of [[d.nvda, '0.01'], [d.aapl, '0.005'], [d.msft, '0.003']]) {
  await send(stock, 'mint', [to, parseUnits(amount, 18)])
}
const balance = await publicClient.readContract({ address: d.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [to] })
console.log(`Funded ${to}: ${formatUnits(balance, 6)} USDC, 0.01 tNVDA, 0.005 tAAPL, 0.003 tMSFT`)
