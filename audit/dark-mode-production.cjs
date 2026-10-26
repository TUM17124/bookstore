// Read-only visual baseline. Uses fresh browser contexts, never an owner's session.
const { chromium } = require('@playwright/test')
const fs = require('node:fs/promises')
const path = require('node:path')
;(async () => {
  const output = path.resolve('audit/experience/dark-mode-production-before')
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const results = []
  try {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: theme })
      await context.addInitScript(value => localStorage.setItem('theme', value), theme)
      await context.route('**/*', route => ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort())
      const page = await context.newPage()
      const response = await page.goto('https://plugyard.com/marketplace/', { waitUntil: 'domcontentloaded', timeout: 45000 })
      await page.getByRole('heading', { name: 'Filters' }).waitFor()
      await page.waitForFunction(() => !document.body.textContent.includes('Loading listings'))
      await page.screenshot({ path: path.join(output, theme + '.png'), fullPage: true })
      results.push({ theme, status: response.status(), url: page.url(), styles: await page.locator('main h1,main h2,main aside').evaluateAll(elements => elements.slice(0, 8).map(el => ({ text: el.textContent.slice(0, 80), color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor }))) })
      await context.close()
    }
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2))
    console.log(JSON.stringify({ output, results }, null, 2))
  } finally { await browser.close() }
})().catch(error => { console.error(error.message); process.exitCode = 1 })
