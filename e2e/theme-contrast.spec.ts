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
  for (const route of ['/publish/?kind=book', '/messages/', '/support/', '/seller/profile/']) {
    await page.goto(route)
    await readable(page.locator('main h1'))
    if (route.startsWith('/publish/')) await readable(page.getByPlaceholder('Title', { exact: true }))
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
    await page.screenshot({ path: info.outputPath(route.split('?')[0].replaceAll('/', '-') + '.png'), fullPage: true })
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
for (const theme of ['light', 'dark']) test(`${theme} marketplace homepage, publishing and wishlist interactions`, async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await fixture(page, theme)
  const bookCategory = { ...category, slug: 'books', label: 'Books', viewer_mode: 'book_3d', browse_url: '/books/' }
  await page.route('**/api/categories/**', route => route.fulfill({ json: { all: [category, bookCategory], navbar: [category, bookCategory] } }))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Browse departments' })).toBeVisible()
  expect((await page.getByRole('textbox', { name: 'Search products, books and services' }).boundingBox())?.width).toBeGreaterThan(200)
  await expect(page.getByRole('heading', { name: listing.title })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Books', exact: true }).last()).toHaveAttribute('href', '/books/')
  await page.screenshot({ path: info.outputPath('homepage.png'), fullPage: true })
  await page.goto('/publish/')
  await expect(page.getByRole('heading', { name: 'What would you like to sell or publish?' })).toBeVisible()
  await page.locator('article').filter({ has: page.getByRole('heading', { name: 'Electronics' }) }).getByRole('link', { name: 'Continue' }).click()
  await expect(page.getByRole('combobox', { name: 'Category', exact: true })).toHaveValue('electronics')
  let submitted: Record<string, unknown> | null = null
  await page.route('**/api/marketplace/me/listings/**', async route => {
    if(route.request().url().endsWith('/listings/')) submitted = route.request().postDataJSON()
    await route.fulfill({ json: { ...listing, status: 'pending' } })
  })
  await page.getByLabel('Title', { exact: true }).fill('Synthetic laptop submission')
  await page.getByLabel('Description', { exact: true }).fill('Synthetic demonstration of the publishing workflow.')
  await page.getByLabel('Quantity available', { exact: true }).fill('2')
  await page.getByLabel('Price', { exact: true }).fill('100')
  await page.getByRole('button', { name: 'Submit listing', exact: true }).click()
  await expect(page.locator('main').getByRole('status')).toContainText('submitted for review')
  expect(submitted).toMatchObject({ category: 'electronics', inventory: { quantity: 2 }, title: 'Synthetic laptop submission' })
  await page.screenshot({ path: info.outputPath('publishing-submitted.png'), fullPage: true })
  await page.goto('/wishlist/')
  await page.getByRole('button', { name: `Share ${listing.title}`, exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Listing link' })).toHaveValue(/\/listings\/contrast-test-laptop\/$/)
  await page.getByRole('dialog', { name: 'Share this listing' }).getByRole('button', { name: 'Close', exact: true }).click()
  await page.route('**/api/wishlist/7/', route => route.fulfill({ status: 500, json: { detail: 'Synthetic failure' } }))
  await page.getByRole('button', { name: `Remove ${listing.title} from Wishlist`, exact: true }).click()
  await expect(page.locator('main').getByRole('alert')).toContainText('Synthetic failure')
  await expect(page.getByRole('button', { name: `Remove ${listing.title} from Wishlist`, exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.route('**/api/wishlist/7/', route => route.fulfill({ status: 204 }))
  await page.getByRole('button', { name: `Remove ${listing.title} from Wishlist`, exact: true }).click()
  await expect(page.getByText('No saved items match this selection.')).toBeVisible()
})

for (const theme of ['light', 'dark']) test(`${theme} six-sided viewer, gallery fallback and keyboard rotation`, async ({ page }, info) => {
  await fixture(page, theme)
  await page.setViewportSize({ width: 390, height: 844 })
  const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="180" height="180" fill="#be185d"/><text x="20" y="90" fill="white">TEST PHOTO</text></svg>')
  const surfaces = ['front', 'back', 'left', 'right', 'top', 'bottom'].map((side, index) => ({ id: index + 1, surface: side, slot_key: side, slot_label: side, alt_text: side, image, external_url: '', position: index }))
  const complete = { ...listing, media: surfaces, viewer: { mode: 'turntable', config: {} } }
  const incomplete = { ...complete, id: 8, title: 'Incomplete viewer', media: surfaces.slice(0, 3) }
  await page.route('**/api/marketplace/listings/**', route => route.fulfill({ json: { results: [complete, incomplete], count: 2, next: null } }))
  await page.goto('/marketplace/')
  await expect(page.getByRole('heading', { name: 'Incomplete viewer' })).toBeVisible()
  await page.getByRole('heading', { name: listing.title }).last().click()
  const viewer = page.getByRole('group', { name: /3D product viewer/ })
  await expect(viewer).toBeVisible()
  const object = viewer.locator('div').first()
  const before = await object.getAttribute('style')
  await viewer.focus()
  await page.keyboard.press('ArrowRight')
  expect(await object.getAttribute('style')).not.toBe(before)
  await page.getByRole('button', { name: 'back', exact: true }).click()
  await expect(object).toHaveAttribute('style', /rotateY\(180deg\)/)
  await page.getByRole('button', { name: 'Reset view' }).click()
  await expect(object).toHaveAttribute('style', /rotateY\(-25deg\)/)
  await page.screenshot({ path: info.outputPath('six-sided.png'), fullPage: true })
  await page.getByRole('button', { name: 'Switch to image gallery' }).click()
  await page.getByRole('button', { name: 'Show back', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Show back', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('heading', { name: 'Incomplete viewer' }).click()
  await expect(viewer).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Show front', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open 3D viewer' })).toHaveCount(0)
})

for (const theme of ['light', 'dark']) test(`${theme} Books department genres and independent format filters`, async ({ page }, info) => {
  await fixture(page, theme)
  await page.setViewportSize({ width: 390, height: 844 })
  const root = { ...category, slug: 'books', label: 'Books', viewer_mode: 'book_3d', browse_url: '/books/' }
  const genre = { ...root, slug: 'fiction', label: 'Fiction', parent: 'books', browse_url: '/books/?category=fiction' }
  const child = { ...genre, slug: 'mystery', label: 'Mystery', parent: 'fiction', browse_url: '/books/?category=mystery' }
  await page.route('**/api/categories/**', route => route.fulfill({ json: { all: [root, genre, child], navbar: [{ ...root, children: [{ ...genre, children: [child] }] }] } }))
  const book = { id: '8', slug: 'theme-test-book', title: 'Theme test book', author: 'Test author', year: '2026', stars: 0, desc: 'Synthetic book description', images: { front: '/icon-512.png' }, hasEbook: true, hasAudiobook: true, price: 0, isFree: true }
  let params = new URLSearchParams()
  await page.route('**/api/books-department/**', async route => { params = new URL(route.request().url()).searchParams; await route.fulfill({ json: { count: 1, next: null, results: [book] } }) })
  await page.route('**/api/home/sections/**', route => route.fulfill({ json: { sections: [] } }))
  await page.goto('/books/')
  await expect(page.getByText('Theme test book').first()).toBeVisible()
  await page.getByRole('navigation', { name: 'Browse by genre' }).getByRole('link', { name: 'Fiction' }).click()
  await expect(page.getByRole('heading', { name: 'Fiction', exact: true }).first()).toBeVisible()
  await page.getByRole('navigation', { name: 'Browse by genre' }).getByRole('link', { name: 'Mystery' }).click()
  await expect(page.getByRole('heading', { name: 'Mystery', exact: true }).first()).toBeVisible()
  await page.getByLabel('Browse by format').selectOption('audiobook')
  await expect.poll(() => params.get('book_format')).toBe('audiobook')
  expect(params.get('category')).toBe('mystery')
  await page.getByLabel('Browse by format').selectOption('ebook')
  await expect.poll(() => params.get('book_format')).toBe('ebook')
  await page.screenshot({ path: info.outputPath('books-department.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
})

for (const theme of ['light', 'dark']) test(`${theme} public demonstration is separate from real commerce`, async ({ page }, info) => {
  await fixture(page, theme)
  await page.setViewportSize({ width: 390, height: 844 })
  const demo = { ...listing, is_demo: true, checkout_disabled: true, title: 'Hard-drive DEMO / NOT FOR SALE', url: '/showcase/?listing=contrast-test-laptop' }
  await page.route('**/api/marketplace/demo-showcase/**', route => route.fulfill({ json: { count: 1, next: null, results: [demo] } }))
  await page.goto('/showcase/')
  await expect(page.getByRole('heading', { name: demo.title })).toBeVisible()
  await page.getByRole('heading', { name: demo.title }).click()
  await expect(page.getByText('This demonstration cannot be purchased or bid on.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Buy Now|Send offer|Wishlist|Place bid/ })).toHaveCount(0)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  await page.screenshot({ path: info.outputPath('demo-showcase.png'), fullPage: true })
})

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
