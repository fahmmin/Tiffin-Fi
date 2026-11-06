// MetaMask with the throwaway e2e wallet (E2E_SEED from e2e/.env.e2e). Arc testnet is not added here: the app adds
// it through wallet_addEthereumChain when the tests connect, which is the path real visitors take.
import { defineWalletSetup } from '@synthetixio/synpress'
import { MetaMask } from '@synthetixio/synpress/playwright'

// A local test password for the MetaMask profile Synpress builds; it protects nothing real.
const PASSWORD = 'TiffinFi-e2e-only'

export default defineWalletSetup(PASSWORD, async (context, walletPage) => {
  const seed = process.env.E2E_SEED
  if (!seed) throw new Error('E2E_SEED is missing: run "npm run wallet" and "npm run fund" first')
  const metamask = new MetaMask(context, walletPage, PASSWORD)
  await metamask.importWallet(seed)
  // MetaMask 13 ends onboarding on a "Your wallet is ready!" screen that Synpress 4.1.2 doesn't click through.
  const open = walletPage.getByRole('button', { name: 'Open wallet' })
  if (await open.isVisible().catch(() => false)) await open.click()
  await walletPage.waitForTimeout(3000)
})
