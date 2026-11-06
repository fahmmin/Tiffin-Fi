// End-to-end and stress tests of the Tiffin Fi app on Arc testnet, with a real injected wallet (see wallet.ts).
// Every confirmed step below is a real transaction from the throwaway e2e wallet.
import type { Page } from '@playwright/test'
import { expect, test, type TestWallet } from './wallet'

const confirmed = (page: Page, label: string | RegExp) =>
  expect(page.getByRole('status').filter({ hasText: label }).filter({ hasText: 'confirmed.' }).first()).toBeVisible()

async function openTrade(page: Page) {
  await page.goto('/#trade')
  await page.getByRole('button', { name: 'Connect a wallet' }).click()
  // The wallet starts on Ethereum without Arc: the app has to add Arc and switch to it.
  await expect(page.getByRole('button', { name: 'Enter an amount' })).toBeVisible()
}

async function mode(page: Page, name: 'Buy' | 'Sell' | 'Swap') {
  await page.getByRole('group', { name: 'Buy, sell or swap' }).getByRole('button', { name, exact: true }).click()
}

async function pick(page: Page, legend: 'Pay with' | 'Receive', symbol: string) {
  await page.getByRole('group', { name: legend }).getByText(symbol, { exact: true }).click()
}

/** One swap through the app: an allow step when needed (its own click), then the swap. */
async function swap(page: Page, from: string, to: string, amount: string) {
  await mode(page, 'Swap')
  await pick(page, 'Pay with', from)
  await pick(page, 'Receive', to)
  await page.locator('#swap-amount').fill(amount)
  const allow = page.getByRole('button', { name: `Allow ${amount} ${from}` })
  const go = page.getByRole('button', { name: `Swap ${from} for ${to}` })
  await expect(allow.or(go)).toBeEnabled()
  if (await allow.isVisible()) {
    await allow.click()
    await confirmed(page, `Allow ${amount} ${from}`)
  }
  await expect(go).toBeEnabled()
  await go.click()
  await confirmed(page, `Swap ${from} for ${to}`)
}

async function sentCount(wallet: TestWallet) {
  return wallet.sent.length
}

test('connects, adds Arc to the wallet and shows live balances', async ({ page, wallet }) => {
  await openTrade(page)
  await expect(page.getByText(/You have [\d.,]+ USDC/)).toBeVisible()
  await expect(page.getByText(wallet.address.slice(0, 6), { exact: false }).first()).toBeVisible()
  await page.goto('/#fund')
  await expect(page.getByText('One share is worth')).toBeVisible()
})

test('bad amounts never reach the wallet', async ({ page, wallet }) => {
  await openTrade(page)
  const field = page.locator('#buy-amount')
  const action = page.locator('button.btn-block')
  for (const bad of ['0', '0.000', 'abc', '0.1.2', '-1', '1e3']) {
    await field.fill(bad)
    await expect(action, `"${bad}" must not be sendable`).toBeDisabled()
  }
  await field.fill('0')
  await expect(page.getByText('Enter an amount above zero.')).toBeVisible()
  await field.fill('100000')
  await expect(page.getByText(/You have [\d.,]+ USDC\./).last()).toBeVisible()
  expect(await sentCount(wallet)).toBe(0)
})

test('a cancelled approval shows a clear message and the form recovers', async ({ page, wallet }) => {
  await openTrade(page)
  await page.locator('#buy-amount').fill('0.05')
  wallet.rejectNext()
  await page.getByRole('button', { name: 'Allow 0.05 USDC' }).click()
  await expect(page.getByText('You cancelled the request in your wallet.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Allow 0.05 USDC' })).toBeEnabled()
  expect(await sentCount(wallet)).toBe(0)
})

test('buys BSKT with USDC, then sells it back', async ({ page }) => {
  await openTrade(page)
  await page.locator('#buy-amount').fill('0.1')
  await page.getByRole('button', { name: 'Allow 0.1 USDC' }).click()
  await confirmed(page, 'Buy BSKT')

  await mode(page, 'Sell')
  await page.locator('#sell-amount').fill('0.05')
  await page.getByRole('button', { name: 'Sell 0.05 BSKT' }).click()
  await confirmed(page, 'Sell BSKT')
})

test('a double click sends one transaction, not two', async ({ page, wallet }) => {
  await openTrade(page)
  await mode(page, 'Sell')
  await page.locator('#sell-amount').fill('0.01')
  const sell = page.getByRole('button', { name: 'Sell 0.01 BSKT' })
  await sell.dblclick()
  await confirmed(page, 'Sell BSKT')
  expect(await sentCount(wallet)).toBe(1)
})

test('swaps USDC for a stock and one stock for another', async ({ page }) => {
  await openTrade(page)
  await swap(page, 'USDC', 'tAAPL', '0.05')
  await swap(page, 'tNVDA', 'tMSFT', '0.001')
})

test('stress: ten back-to-back swaps, then the activity feed lists them', async ({ page, wallet }) => {
  test.setTimeout(900_000)
  await openTrade(page)
  for (let i = 0; i < 5; i++) {
    await swap(page, 'USDC', 'tNVDA', '0.02')
    await swap(page, 'tNVDA', 'USDC', '0.0001')
  }
  expect(await sentCount(wallet)).toBeGreaterThanOrEqual(10)
  await page.goto('/#activity')
  await expect(page.getByText(new RegExp(wallet.address.slice(0, 6), 'i')).first()).toBeVisible()
})

test('leaving a pending trade for another screen and coming back is safe', async ({ page }) => {
  await openTrade(page)
  await swap(page, 'USDC', 'tMSFT', '0.02')
  await page.locator('#swap-amount').fill('0.02')
  await page.getByRole('button', { name: /Allow 0.02 USDC|Swap USDC for tMSFT/ }).click()
  await page.goto('/#fund')
  await expect(page.getByText('One share is worth')).toBeVisible()
  await page.goto('/#trade')
  await expect(page.getByRole('button', { name: 'Enter an amount' })).toBeVisible()
})

test('asks to switch back when the wallet leaves Arc', async ({ page, wallet }) => {
  await openTrade(page)
  await wallet.moveTo(1)
  await expect(page.getByRole('button', { name: 'Switch to Arc testnet' })).toBeVisible()
  await page.getByRole('button', { name: 'Switch to Arc testnet' }).click()
  await expect(page.getByRole('button', { name: 'Enter an amount' })).toBeVisible()
})
