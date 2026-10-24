import { test, expect, type Page, type Locator } from '@playwright/test'

// Isolated browser fixtures: no requests, tokens or writes reach production.
const listing = {
  id: 7, seller: { id: 2, name: 'Test Seller', display_name: 'Test Seller', slug: 'test-seller' },
  category: 'electronics', title: 'Contrast test laptop', slug: 'contrast-test-laptop',
  description_text: 'A laptop with an accurately described condition.', condition: 'used',
  condition_and_defects: 'Small scratch on lid.', price_type: 'fixed', price_amount: '45000.00',
  currency: 'KES', country: 'KE', locality: 'Nairobi', fulfillment_type: 'shipping',
  status: 'active', media: [], viewer: { mode: 'gallery', config: {} },
  inventory_summary: { policy: 'finite', configured: true, in_stock: true, variants: [{ variant_id: null, policy: 'finite', in_stock: true, low_stock: false, available_quantity: 5 }] },
  is_demo: false, checkout_disabled: true, url: '/listings/contrast-test-laptop/',
}
const category = {
  slug: 'electronics', label: 'Electronics', parent: null, fulfillment_type: 'shipping',
  pricing_options: ['fixed'], viewer_mode: 'gallery', attributes: [], media_slots: [],
  inventory_policy: 'finite', variants_enabled: false,
}

async function fixture(page: Page, theme: string) {
  await page.addInitScript(({ theme, token }) => {
    localStorage.clear()
    localStorage.setItem('theme', theme)
    localStorage.setItem('access_token', token)
  }, { theme, token: `x.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.x` })
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (!url.pathname.startsWith('/api/')) {
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return route.abort()
      return route.continue()
    }
    const path = url.pathname
    let data: unknown = {}
    if (path === '/api/site/config/') data = { currency: { code: 'KES', symbol: 'KES', position: 'before', decimals: 2 }, features: { install_prompt: false, push_prompt: false, marketplace: true, publishing: true }, site: { name: 'PlugYard' } }
    else if (path.includes('/recommendations')) data = { results: [{ listing, reason: 'Selected from your interests' }] }
    else if (path === '/api/marketplace/categories/') data = [category]
    else if (path.includes('/conditions')) data = [{ key: 'used', label: 'Used' }]
    else if (path.startsWith('/api/marketplace/listings/')) data = { count: 43, results: [listing], next: null, previous: null }
    else if (path === '/api/wishlist/') data = { count: 1, results: [{ id: 3, listing }], next: null, previous: null }
    else if (path.includes('/categories')) data = { all: [category], navbar: [category], tree: [category] }
    else if (path === '/api/me/') data = { id: 1, email: 'test@example.invalid', username: 'test-user' }
    else if (path === '/api/books/') data = { results: [{ id: 8, title: 'Theme test book', author: 'Test author', slug: 'theme-test-book' }] }
    else if (path === '/api/notifications/') data = { unread: 1, results: [{ id: 4, title: 'Your order update', body: 'Review your order timeline.', url: '/purchases/', read: false, created_at: '2026-10-24T08:00:00Z' }] }
    else if (path === '/api/support/tickets/') data = []
    else if (path === '/api/marketplace/conversations/') data = { results: [{ id: 'test-chat', listing_title: 'Laptop question', messages: [{ id: 1, body: 'Is the charger included?', created_at: '2026-10-24T08:00:00Z' }] }] }
    else if (path === '/api/seller-profile/me/') data = { slug: 'test-seller', display_name: 'Test Seller', biography: 'Independent seller', verified: false, rating: { average: null, count: 0 }, completed_sales: 0, member_since: '2026-01-01', social_links: {} }
    else if (/notifications|purchases|sales|conversations/.test(path)) data = { count: 0, results: [] }
    else if (path.includes('/site/announcements')) data = { items: [] }
    else if (path.includes('/legal')) data = { required: [], policies: [], accepted: true }
    await route.fulfill({ json: data })
  })
}

async function readable(locator: Locator, pseudo: string | null = null) {
  await expect(locator).toBeVisible()
  const result = await locator.evaluate((element, pseudo) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    const rgba = (color: string) => {
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1)
      return Array.from(ctx.getImageData(0, 0, 1, 1).data).map((v, i) => i === 3 ? v / 255 : v)
    }
    const blend = (a: number[], b: number[]) => [0, 1, 2].map(i => a[i] * a[3] + b[i] * (1 - a[3])).concat(1)
    const ancestors: Element[] = []
    for (let node: Element | null = element; node; node = node.parentElement) ancestors.unshift(node)
    let background = [255, 255, 255, 1]
    for (const node of ancestors) background = blend(rgba(getComputedStyle(node).backgroundColor), background)
    const foreground = blend(rgba(getComputedStyle(element, pseudo).color), background)
    const luminance = (rgb: number[]) => rgb.slice(0, 3).map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
    const a = luminance(foreground), b = luminance(background)
    return { ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), color: getComputedStyle(element).color, background, text: element.textContent?.slice(0, 70) }
  }, pseudo)
  expect(result.ratio, JSON.stringify(result)).toBeGreaterThanOrEqual(4.5)
}

for (const theme of ['light', 'dark']) for (const width of [320, 375, 390, 768, 1024, 1440]) {
  test(`${theme} ${width}px marketplace, detail, wishlist and publishing contrast`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await fixture(page, theme)
    await page.goto('/marketplace/')
    await expect(page.locator('html')).toHaveClass(new RegExp(theme))
    await readable(page.getByRole('heading', { name: 'Contrast test laptop' }).last())
    await readable(page.getByRole('heading', { name: 'Filters' }))
    await readable(page.getByText('43 listings', { exact: true }))
    await readable(page.getByRole('heading', { name: 'Recommended for You' }))
    await readable(page.getByText('Selected from your interests', { exact: true }))
    for (const heading of await page.locator('footer h3:visible').all()) await readable(heading)
    await readable(page.getByPlaceholder('Search products and services'))
    await readable(page.getByPlaceholder('Search products and services'), '::placeholder')
    await readable(page.getByLabel('Category', { exact: true }))
    await readable(page.locator('select').filter({ has: page.locator('option[value="relevance"]') }))
    await page.screenshot({ path: info.outputPath('marketplace.png'), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await page.getByRole('heading', { name: 'Contrast test laptop' }).last().click()
    await readable(page.getByRole('dialog').getByRole('heading', { name: 'Contrast test laptop' }))
    await readable(page.getByText(listing.description_text, { exact: true }))
    await page.screenshot({ path: info.outputPath('product-detail.png'), fullPage: true })
    await page.goto('/wishlist/')
    await readable(page.getByRole('heading', { name: 'Wishlist', exact: true }))
    await readable(page.getByRole('heading', { name: 'Contrast test laptop' }))
    await readable(page.getByText('Sold by Test Seller', { exact: true }))
    await page.screenshot({ path: info.outputPath('wishlist.png'), fullPage: true })
    await page.goto('/sell/')
    await readable(page.getByRole('heading', { name: 'Create a listing' }))
    await readable(page.getByLabel('Title', { exact: true }))
    await readable(page.getByLabel('Description', { exact: true }))
    await page.screenshot({ path: info.outputPath('publishing.png'), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  })
}

for (const theme of ['light', 'dark']) test(`${theme} account, book publishing, messaging and support`, async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await fixture(page, theme)
  for (const route of ['/publish/', '/messages/', '/support/', '/seller/profile/']) {
    await page.goto(route)
    await readable(page.locator('main h1'))
    if (route === '/publish/') await readable(page.getByPlaceholder('Title', { exact: true }))
    if (route === '/messages/') {
      await readable(page.getByText('Laptop question', { exact: true }).last())
      await readable(page.getByText('Is the charger included?', { exact: true }).last())
      await readable(page.getByRole('textbox', { name: 'Message', exact: true }))
    }
    if (route === '/support/') {
      await readable(page.getByPlaceholder('Subject', { exact: true }))
      await readable(page.getByPlaceholder('How can we help?'))
    }
    for (const heading of await page.locator('footer h3:visible').all()) await readable(heading)
    await page.screenshot({ path: info.outputPath(route.replaceAll('/', '-') + '.png'), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  }
})

for (const width of [390, 1440]) test(`${width}px theme toggle, search and notification overlays`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 })
  await fixture(page, 'light')
  await page.goto('/marketplace/')
  for (const theme of ['dark', 'light']) {
    await page.getByRole('button', { name: `Switch to ${theme} mode` }).filter({ visible: true }).click()
    await expect(page.locator('html')).toHaveClass(new RegExp(theme))
    await readable(page.getByRole('heading', { name: 'Filters' }))
    await page.getByRole('button', { name: 'Search books', exact: true }).filter({ visible: true }).click()
    const search = page.getByRole('dialog')
    await readable(search.getByRole('textbox', { name: 'Search', exact: true }), '::placeholder')
    await search.getByRole('textbox', { name: 'Search', exact: true }).fill('Theme')
    await readable(search.getByText('Test author', { exact: true }))
    await readable(search.getByText('Last search', { exact: false }))
    await page.screenshot({ path: info.outputPath(`${theme}-search.png`), fullPage: true })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '1 unread notifications', exact: true }).filter({ visible: true }).click()
    await readable(page.getByText('Your order update', { exact: true }))
    await readable(page.getByText('Review your order timeline.', { exact: true }))
    await page.screenshot({ path: info.outputPath(`${theme}-notifications.png`), fullPage: true })
    await page.getByRole('button', { name: 'Close notifications', exact: true }).last().click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  }
})

// Generate these from the real Django templates with tools/render_theme_previews.py.
// Missing previews fail rather than silently skipping server-rendered pages.
for (const theme of ['light', 'dark']) for (const width of [320, 1440]) {
  test(`${theme} ${width}px server-rendered product, category, seller and auction`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await fixture(page, theme)
    for (const template of ['listing_public', 'category_public', 'seller_public', 'auction_public']) {
      const response = await page.goto(`/theme-fixtures/${template}.html`)
      expect(response?.status()).toBe(200)
      await expect(page.locator('html')).toHaveClass(new RegExp(theme))
      await readable(page.locator('h1'))
      for (const paragraph of await page.locator('main p:visible').all()) {
        if ((await paragraph.innerText()).trim()) await readable(paragraph)
      }
      for (const link of await page.locator('main a:visible').all()) await readable(link)
      await page.screenshot({ path: info.outputPath(template + '.png'), fullPage: true })
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    }
  })
}
