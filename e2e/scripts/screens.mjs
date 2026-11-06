// Full-page screenshots of the app's five screens at desktop and phone width, used as design references.
//   node scripts/screens.mjs <baseUrl> <outDir> [namePrefix]
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const [base, out, prefix = ''] = process.argv.slice(2)
if (!base || !out) throw new Error('usage: node scripts/screens.mjs <baseUrl> <outDir> [namePrefix]')
mkdirSync(out, { recursive: true })
const routes = ['', 'fund', 'trade', 'activity', 'how']
const sizes = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } }

const browser = await chromium.launch()
for (const [size, viewport] of Object.entries(sizes)) {
  const page = await browser.newPage({ viewport })
  for (const route of routes) {
    await page.goto(`${base}/#${route}`)
    await page.waitForTimeout(6000) // the screens read live data from Arc testnet
    const path = `${out}/${prefix}${route || 'landing'}-${size}.jpg`
    await page.screenshot({ path, fullPage: true, type: 'jpeg', quality: 80 })
    console.log(path)
    if (route || size !== 'desktop') continue
    // The landing page is long: one image per section keeps each one legible.
    const sections = page.locator('main > section, body footer')
    for (let i = 0; i < (await sections.count()); i++) {
      const part = `${out}/${prefix}landing-section-${String(i + 1).padStart(2, '0')}.jpg`
      await sections.nth(i).screenshot({ path: part, type: 'jpeg', quality: 85 })
      console.log(part)
    }
  }
  await page.close()
}
await browser.close()
