// The same real-wallet tests against the Arc Studio build of the app (studio/), served on STUDIO_URL
// (default http://localhost:4199, e.g. `vite preview --port 4199` in studio/). Arc Studio couldn't run its wallet flows
// in its sandbox; these do, with real Arc testnet transactions from the throwaway e2e wallet.
import type { Page } from '@playwright/test'
import { expect, test } from './wallet'

test.use({ baseURL: process.env.STUDIO_URL ?? 'http://localhost:4199' })

const done = (page: Page, text: string) => expect(page.getByRole('status').filter({ hasText: text }).first()).toBeVisible()

async function openTrade(page: Page) {
  await page.goto('/#trade')
  const form = page.getByRole('tabpanel')
  await form.getByRole('button', { name: 'Connect wallet' }).click()
  // The wallet starts on Ethereum without Arc: the app adds Arc and switches.
  await expect(form.getByRole('button', { name: 'Connect wallet' })).toHaveCount(0)
  await expect(form.getByRole('button', { name: 'Switch to Arc testnet' })).toHaveCount(0)
}

async function tab(page: Page, name: 'Buy' | 'Sell' | 'Swap') {
  await page.getByRole('tablist', { name: 'Trade type' }).getByRole('tab', { name }).click()
}

test('studio app: connects and adds Arc', async ({ page, wallet }) => {
  await openTrade(page)
  await expect(page.getByText(new RegExp(wallet.address.slice(2, 6), 'i')).first()).toBeVisible()
})

test('studio app: a cancelled approval shows a clear message', async ({ page, wallet }) => {
  await openTrade(page)
  await page.locator('#amt-you-pay').fill('0.05')
  wallet.rejectNext()
  await page.getByRole('button', { name: 'Approve USDC' }).click()
  await expect(page.getByText('You cancelled the request in your wallet.')).toBeVisible()
  expect(wallet.sent.length).toBe(0)
})

test('studio app: bad amounts never reach the wallet', async ({ page, wallet }) => {
  await openTrade(page)
  for (const bad of ['0', 'abc', '-1', '100000']) {
    await page.locator('#amt-you-pay').fill(bad)
    await expect(page.getByRole('tabpanel').getByRole('button').last()).toBeDisabled()
  }
  expect(wallet.sent.length).toBe(0)
})

test('studio app: buys the basket with USDC, then sells some back', async ({ page, wallet }) => {
  await openTrade(page)
  await page.locator('#amt-you-pay').fill('0.05')
  await page.getByRole('button', { name: 'Approve USDC' }).dblclick()
  await done(page, 'USDC approved. Now buy.')
  expect(wallet.sent.length).toBe(1)
  await page.getByRole('button', { name: 'Buy the basket' }).click()
  await done(page, 'Bought. Confirmed on Arc testnet')

  await tab(page, 'Sell')
  await page.locator('#amt-you-sell').fill('0.02')
  await page.getByRole('button', { name: 'Sell for USDC' }).click()
  await done(page, 'Confirmed on Arc testnet')
})

test('studio app: swaps USDC for a stock and back', async ({ page }) => {
  await openTrade(page)
  await tab(page, 'Swap')
  await page.getByRole('combobox', { name: 'Token you pay' }).selectOption({ label: 'USDC' })
  await page.getByRole('combobox', { name: 'Token you receive' }).selectOption({ label: 'tNVDA' })
  await page.locator('#amt-you-pay').fill('0.03')
  const approve = page.getByRole('button', { name: 'Approve USDC' })
  const go = page.getByRole('button', { name: 'Swap USDC for tNVDA' })
  // Wait for the allowance read to decide which step the form shows.
  await expect(approve.or(go)).toBeEnabled()
  if (await approve.isVisible()) {
    await approve.click()
    await done(page, 'USDC approved. Now swap.')
  }
  await expect(go).toBeEnabled()
  await go.click()
  await done(page, 'Swapped. Confirmed on Arc testnet')
})

test('studio app: asks to switch back when the wallet leaves Arc', async ({ page, wallet }) => {
  await openTrade(page)
  await wallet.moveTo(1)
  const form = page.getByRole('tabpanel')
  await expect(form.getByRole('button', { name: 'Switch to Arc testnet' })).toBeVisible()
  await form.getByRole('button', { name: 'Switch to Arc testnet' }).click()
  await expect(form.getByRole('button', { name: 'Switch to Arc testnet' })).toHaveCount(0)
})
