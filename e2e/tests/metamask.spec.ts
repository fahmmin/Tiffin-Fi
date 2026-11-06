// The same flows through the real MetaMask UI, with Synpress. Needs Linux, macOS or WSL (see below).
// Every confirmed step is a real transaction from the throwaway e2e wallet.
import { testWithSynpress } from '@synthetixio/synpress'
import { MetaMask, metaMaskFixtures } from '@synthetixio/synpress/playwright'
import type { Page } from '@playwright/test'
import arcSetup from '../wallet-setup/arc.setup'

const test = testWithSynpress(metaMaskFixtures(arcSetup))
const { expect } = test

// Synpress can't run MetaMask on native Windows: its profile copy fails with EBUSY on locked files, so MetaMask
// starts un-onboarded. Run this suite on Linux, macOS or WSL; stress.spec.ts covers the same flows on any OS.
test.skip(process.platform === 'win32', 'Synpress MetaMask needs Linux, macOS or WSL')

async function openTrade(page: Page, metamask: MetaMask) {
  await page.goto('/#trade')
  await page.getByRole('button', { name: 'Connect a wallet' }).click()
  await metamask.connectToDapp()
  // The app asks MetaMask to switch to Arc, MetaMask doesn't know Arc yet, so the app adds it.
  await metamask.approveNewNetwork()
  // Connected and on Arc: the form now asks for an amount.
  await expect(page.getByRole('button', { name: 'Enter an amount' })).toBeVisible()
}

async function mode(page: Page, name: 'Buy' | 'Sell' | 'Swap') {
  await page.getByRole('group', { name: 'Buy, sell or swap' }).getByRole('button', { name }).click()
}

async function pick(page: Page, legend: 'Pay with' | 'Receive', symbol: string) {
  await page.getByRole('group', { name: legend }).getByText(symbol, { exact: true }).click()
}

/** Swaps through the app: allow (its own click and approval), then swap. */
async function swap(page: Page, metamask: MetaMask, from: string, to: string, amount: string) {
  await mode(page, 'Swap')
  await pick(page, 'Pay with', from)
  await pick(page, 'Receive', to)
  await page.locator('#swap-amount').fill(amount)
  const allow = page.getByRole('button', { name: `Allow ${amount} ${from}` })
  const go = page.getByRole('button', { name: `Swap ${from} for ${to}` })
  await expect(allow.or(go)).toBeEnabled()
  if (await allow.isVisible()) {
    await allow.click()
    await metamask.approveTokenPermission()
    await expect(page.getByText(`Allow ${amount} ${from}: confirmed.`)).toBeVisible()
  }
  await expect(go).toBeEnabled()
  await go.click()
  await metamask.confirmTransaction()
  await expect(page.getByText(`Swap ${from} for ${to}: confirmed.`)).toBeVisible()
}

test('connects, shows balances and reads the live fund', async ({ context, page, metamaskPage, extensionId }) => {
  const metamask = new MetaMask(context, metamaskPage, arcSetup.walletPassword, extensionId)
  await openTrade(page, metamask)
  await expect(page.getByText(/You have [\d.,]+ USDC/)).toBeVisible()
  await page.goto('/#fund')
  await expect(page.getByText('One share is worth')).toBeVisible()
  await expect(page.getByText(/Wall Street (open|closed)/).first()).toBeVisible()
})

test('rejects bad amounts without sending anything', async ({ context, page, metamaskPage, extensionId }) => {
  const metamask = new MetaMask(context, metamaskPage, arcSetup.walletPassword, extensionId)
  await openTrade(page, metamask)
  const field = page.locator('#buy-amount')
  await field.fill('0')
  await expect(page.getByText('Enter an amount above zero.')).toBeVisible()
  await field.fill('100000')
  await expect(page.getByText(/You have [\d.,]+ USDC\./).last()).toBeVisible()
  await field.fill('abc')
  await expect(page.getByRole('button', { name: 'Enter an amount' })).toBeDisabled()
  await field.fill('0.1.2')
  await expect(page.getByRole('button', { name: 'Enter an amount' })).toBeDisabled()
})

test('a rejected approval shows a clear message and recovers', async ({ context, page, metamaskPage, extensionId }) => {
  const metamask = new MetaMask(context, metamaskPage, arcSetup.walletPassword, extensionId)
  await openTrade(page, metamask)
  await page.locator('#buy-amount').fill('0.05')
  await page.getByRole('button', { name: 'Allow 0.05 USDC' }).click()
  await metamask.rejectTokenPermission()
  await expect(page.getByText('You cancelled the request in your wallet.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Allow 0.05 USDC' })).toBeEnabled()
})

test('buys BSKT with USDC, then sells it back', async ({ context, page, metamaskPage, extensionId }) => {
  const metamask = new MetaMask(context, metamaskPage, arcSetup.walletPassword, extensionId)
  await openTrade(page, metamask)
  await page.locator('#buy-amount').fill('0.1')
  await page.getByRole('button', { name: 'Allow 0.1 USDC' }).click()
  await metamask.approveTokenPermission()
  await metamask.confirmTransaction()
  await expect(page.getByText('Buy BSKT: confirmed.')).toBeVisible()

  await mode(page, 'Sell')
  await page.locator('#sell-amount').fill('0.05')
  await page.getByRole('button', { name: 'Sell 0.05 BSKT' }).click()
  await metamask.confirmTransaction()
  await expect(page.getByText('Sell BSKT: confirmed.')).toBeVisible()
})

test('swaps USDC for a stock and one stock for another', async ({ context, page, metamaskPage, extensionId }) => {
  const metamask = new MetaMask(context, metamaskPage, arcSetup.walletPassword, extensionId)
  await openTrade(page, metamask)
  await swap(page, metamask, 'USDC', 'tAAPL', '0.05')
  await swap(page, metamask, 'tNVDA', 'tMSFT', '0.001')
})

test('stress: ten back-to-back swaps, then the activity feed lists them', async ({ context, page, metamaskPage, extensionId }) => {
  const metamask = new MetaMask(context, metamaskPage, arcSetup.walletPassword, extensionId)
  await openTrade(page, metamask)
  for (let i = 0; i < 5; i++) {
    await swap(page, metamask, 'USDC', 'tNVDA', '0.02')
    await swap(page, metamask, 'tNVDA', 'USDC', '0.0001')
  }
  await page.goto('/#activity')
  await expect(page.getByText(/0xdcaD/i).first()).toBeVisible()
})

test('asks to switch back when the wallet leaves Arc', async ({ context, page, metamaskPage, extensionId }) => {
  const metamask = new MetaMask(context, metamaskPage, arcSetup.walletPassword, extensionId)
  await openTrade(page, metamask)
  await metamask.switchNetwork('Ethereum Mainnet')
  await expect(page.getByRole('button', { name: 'Switch to Arc testnet' })).toBeVisible()
  await page.getByRole('button', { name: 'Switch to Arc testnet' }).click()
  await metamask.approveSwitchNetwork()
  await expect(page.getByRole('button', { name: 'Enter an amount' })).toBeVisible()
})
