import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Start sibling tools/run_browser_acceptance_server.py first. These tests use
// real Django auth/ORM, with synthetic data only. No external requests allowed.
test.skip(process.env.PLUGYARD_ACCEPTANCE !== '1', 'Requires disposable local acceptance server')
test.use({ serviceWorkers: 'block', actionTimeout: 20_000 })
test.setTimeout(180_000)
const credentials = () => JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'plugyard-browser-credentials.json'), 'utf8'))

test.beforeEach(async ({ context }) => {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.startsWith('/api/')) {
      try {
        const response = await route.fetch({ url: `http://127.0.0.1:8010${url.pathname}${url.search}` })
        await route.fulfill({ response })
      } catch {
        // Playwright's raw request errors include Authorization headers.
        throw new Error(`Local acceptance API request failed: ${url.pathname}`)
      }
    } else if (['127.0.0.1', 'localhost'].includes(url.hostname)) await route.continue()
    else await route.abort()
  })
})

test.afterEach(async ({ context }) => {
  await context.unrouteAll({ behavior: 'ignoreErrors' })
})

async function login(page: Page, role: 'seller' | 'buyer' | 'onboarding', next = '/') {
  const creds = credentials()
  await page.goto(`/login/?next=${encodeURIComponent(next)}`)
  await page.getByPlaceholder('Email', { exact: true }).fill(creds[role])
  await page.getByPlaceholder('Password', { exact: true }).fill(creds.password)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page).not.toHaveURL(/\/login\//, { timeout: 20_000 })
}

test('real guest and member targeting excludes disabled, scheduled and wrong-audience banners', async ({ page }) => {
  const errors: string[] = []
  const guestViews: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    if (/\/banners\/1\/event\//.test(request.url()) && request.postDataJSON()?.type === 'view') guestViews.push(request.url())
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Acceptance guest banner' })).toBeVisible({ timeout: 20_000 })
  await expect.poll(() => guestViews.length).toBe(1)
  const accountPrompt = page.locator('div.fixed').filter({ has: page.getByRole('heading', { name: 'Why create a PlugYard account', exact: true }) })
  await accountPrompt.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: /^Switch to .* mode$/ }).click()
  await page.setViewportSize({ width: 1100, height: 800 })
  await page.waitForTimeout(500)
  expect(guestViews).toHaveLength(1)
  for (const title of ['Acceptance member banner', 'Acceptance disabled banner', 'Acceptance future banner', 'Acceptance expired banner']) {
    await expect(page.getByRole('heading', { name: title })).toHaveCount(0)
  }
  await login(page, 'buyer')
  await expect(page.getByRole('heading', { name: 'Acceptance member banner' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Acceptance guest banner' })).toHaveCount(0)
  await expect(page.getByText('Acceptance member announcement', { exact: true })).toBeVisible()
  expect(errors.filter(message => /hydrat/i.test(message))).toEqual([])
})

test('seller edits, archives, restores and deletes a persisted synthetic listing', async ({ page }) => {
  await login(page, 'seller', '/seller/listings/')
  page.on('dialog', dialog => dialog.accept())
  const card = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Acceptance stock item', exact: true }) })
  await card.getByRole('button', { name: 'Edit listing' }).click()
  await card.getByLabel('Title', { exact: true }).fill('Acceptance edited stock item')
  await card.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Listing changes saved.', { exact: true })).toBeVisible()
  await page.reload()
  const edited = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Acceptance edited stock item', exact: true }) })
  await expect(edited).toBeVisible()
  await edited.getByRole('button', { name: 'Archive', exact: true }).click()
  await expect(edited.getByRole('button', { name: 'Restore as draft', exact: true })).toBeVisible()
  await edited.getByRole('button', { name: 'Restore as draft', exact: true }).click()
  await expect(page.getByText('Listing restored as a draft and sent for review before it can become public.', { exact: true })).toBeVisible()
  await page.reload()
  await expect(edited.getByText('draft', { exact: false }).first()).toBeVisible()
  await edited.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(edited).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Acceptance edited stock item' })).toHaveCount(0)
})

test('Admin disable persists and removes an eligible guest banner', async ({ page, context }) => {
  const creds = credentials()
  const admin = await context.newPage()
  await admin.goto('http://127.0.0.1:8010/admin/login/?next=/admin/shop/banner/')
  await admin.locator('input[name="identifier"]').fill(creds.admin)
  await admin.locator('input[name="password"]').fill(creds.password)
  await admin.getByRole('button', { name: 'Sign in', exact: true }).click()
  await admin.locator('#result_list').getByRole('link', { name: 'Acceptance guest banner', exact: true }).click()
  await admin.locator('#id_is_active').uncheck()
  await admin.locator('input[name="_save"]').click()
  await expect(admin.locator('.success')).toBeVisible()
  const selection = page.waitForResponse(response => response.url().includes('/api/banners/') && response.request().method() === 'GET')
  await page.goto('/')
  await (await selection).finished()
  await expect(page.getByRole('heading', { name: 'Acceptance guest banner' })).toHaveCount(0)
  // Verify the persisted flag by reopening the actual Admin form.
  await admin.locator('#result_list').getByRole('link', { name: 'Acceptance guest banner', exact: true }).click()
  await expect(admin.locator('#id_is_active')).not.toBeChecked()
  await admin.locator('#id_is_active').check()
  await admin.locator('input[name="_save"]').click()
  await admin.close()
})

test('seller confirms stock and recovers a dormant listing through Admin policy', async ({ page }) => {
  await login(page, 'seller', '/dashboard/?tab=inventory')
  await page.getByRole('button', { name: /Acceptance dormant item/ }).click()
  await page.getByLabel('Total physical stock').fill('7')
  await page.getByRole('button', { name: 'Save stock', exact: true }).click()
  await expect(page.getByText('Stock updated.', { exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: /Acceptance dormant item/ }).click()
  await expect(page.getByLabel('Total physical stock')).toHaveValue('7')
  await page.getByRole('button', { name: 'Confirm inventory and reactivate' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Availability confirmed.' })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: /Acceptance dormant item/ }).click()
  await expect(page.getByLabel('Total physical stock')).toHaveValue('7')
  await expect(page.getByRole('button', { name: 'Confirm inventory and reactivate' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Acceptance Reader Book/ })).toHaveCount(0)
})

test('reader renders private PDF text and preserves a page note after reopening', async ({ page }) => {
  const note = `Acceptance note retained ${Date.now()}`
  await login(page, 'buyer', '/books/?book=1')
  await page.getByRole('button', { name: 'Read', exact: true }).click()
  await expect(page.getByText('Acceptance reader page 1.', { exact: false }).first()).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: /Page note/ }).click()
  const editor = page.getByRole('textbox', { name: 'New note', exact: true })
  await editor.fill(note)
  const saved = page.waitForResponse(response => response.url().includes('/notes/') && response.request().method() === 'PUT')
  await page.getByRole('button', { name: 'Save note', exact: true }).click()
  expect((await saved).ok()).toBeTruthy()
  await page.locator('button[aria-pressed]').filter({ hasText: 'Notes' }).click()
  await expect(page.getByText(note, { exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Read', exact: true }).click()
  await page.locator('button[aria-pressed]').filter({ hasText: 'Notes' }).click()
  await expect(page.getByText(note, { exact: true })).toBeVisible()
})

test('seller creates a product draft and Books publishing stays separate', async ({ page }) => {
  const title = `Acceptance draft ${Date.now()}`
  await login(page, 'seller', '/sell/?category=acceptance-products')
  await page.locator('[name="title"]').fill(title)
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Synthetic product created through the real publishing form.')
  await page.locator('[name="condition_and_defects"]').fill('New synthetic fixture; no real inventory.')
  await page.locator('[name="stock_quantity"]').fill('3')
  await page.locator('[name="price_amount"]').fill('1500')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Manage this product', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Manage this product', exact: true }).click()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await page.goto('/publish/')
  await expect(page.getByRole('link', { name: /Books/ }).last()).toBeVisible()
})

test('notification inbox respects recipient and persists mark-as-read', async ({ page }) => {
  await login(page, 'buyer')
  await page.getByRole('button', { name: /unread notifications|^Notifications$/ }).click()
  await expect(page.getByText('Acceptance buyer notification', { exact: true })).toBeVisible()
  await expect(page.getByText('Acceptance seller notification', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Mark all notifications as read', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible()
})

test('synthetic auction accepts a bid only after terms acknowledgement', async ({ page }) => {
  await login(page, 'buyer', '/auctions/?auction=acceptance-live-auction')
  const bid = page.getByRole('button', { name: 'Place server-verified bid', exact: true })
  await expect(bid).toBeDisabled()
  await page.getByLabel('Your private maximum bid').fill('200')
  await page.getByRole('checkbox', { name: /I accept the auction terms/ }).check()
  await bid.click()
  await expect(page.getByText('Your bid was accepted by the server.', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Your private maximum bid')).toBeVisible()
})

test('Robot Reader presents the subscription gate without starting a charge', async ({ page }) => {
  const billed: string[] = []
  page.on('request', request => {
    if (request.method() === 'POST' && /tts\/synthesize|checkout|paystack|initialize/.test(request.url())) billed.push(request.url())
  })
  await login(page, 'buyer', '/books/?book=1')
  await page.getByRole('button', { name: 'Read', exact: true }).click()
  await page.getByRole('button', { name: /Robot reader/i }).click()
  await expect(page.getByRole('link', { name: 'See Robot Reader plans', exact: true })).toBeVisible()
  expect(billed).toEqual([])
})

test('service draft publishing does not require warehouse stock', async ({ page }) => {
  const title = `Acceptance service ${Date.now()}`
  await login(page, 'seller', '/sell/?category=acceptance-services')
  await page.locator('[name="title"]').fill(title)
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Synthetic consulting service, no physical goods.')
  await page.locator('[name="price_amount"]').fill('1200')
  await expect(page.locator('[name="stock_quantity"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await page.getByRole('link', { name: 'Manage this service', exact: true }).click()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
})

test('remaining commerce and reading routes fit both themes and screen sizes', async ({ page }) => {
  await login(page, 'seller')
  for (const theme of ['light', 'dark']) {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      for (const route of ['/sell/?category=acceptance-services', '/dashboard/?tab=inventory', '/dashboard/?tab=products', '/dashboard/?tab=services', '/marketplace/?category=acceptance-products', '/checkout/?bookId=1&type=ebook', '/notes/', '/bookmarks/', '/purchases/', '/pro/', '/support/', '/legal/auction-terms/']) {
        await page.goto(route)
        await page.evaluate(value => {
          document.documentElement.classList.toggle('dark', value === 'dark')
          document.documentElement.style.colorScheme = value
        }, theme)
        await expect(page.locator('main').first(), `${route} ${theme} ${width}`).toBeVisible()
        if (route === '/legal/auction-terms/') await expect(page.getByText('Local fixture only.', { exact: true })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${route} ${theme} ${width}`).toBeLessThanOrEqual(1)
      }
    }
  }
})

test('new seller profile onboarding persists public details and notification preference', async ({ page }) => {
  await login(page, 'onboarding', '/seller/profile/')
  await page.locator('[name="display_name"]').fill('Acceptance New Store')
  await page.locator('[name="slug"]').fill('acceptance-new-store')
  await page.locator('[name="biography"]').fill('Synthetic seller onboarding; no real merchandise.')
  await page.locator('[name="show_location"]').uncheck()
  await page.locator('[name="message_notifications"]').uncheck()
  await page.getByRole('button', { name: 'Save public profile', exact: true }).click()
  await expect(page.getByText('Seller profile saved.', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.locator('[name="display_name"]')).toHaveValue('Acceptance New Store')
  await expect(page.locator('[name="message_notifications"]')).not.toBeChecked()
  await expect(page.locator('[name="show_location"]')).not.toBeChecked()
  await expect(page.getByText('Identity Verified', { exact: true })).toHaveCount(0)
})

test('public and authenticated routes fit desktop and mobile in both themes', async ({ page }, testInfo) => {
  await login(page, 'buyer')
  for (const theme of ['light', 'dark']) {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      for (const route of ['/', '/marketplace/', '/books/', '/auctions/', '/publish/', '/dashboard/', '/wishlist/', '/settings/', '/terms/', '/privacy/']) {
        await page.goto(route)
        await page.evaluate(value => {
          document.documentElement.classList.toggle('dark', value === 'dark')
          document.documentElement.style.colorScheme = value
        }, theme)
        await page.waitForTimeout(300)
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${route} ${theme} ${width}`).toBeLessThanOrEqual(1)
        await expect(page.locator('main').first()).toBeVisible()
        if (['/', '/dashboard/', '/terms/'].includes(route)) {
          await page.screenshot({ path: testInfo.outputPath(`${route.replaceAll('/', '') || 'home'}-${theme}-${width}.png`) })
        }
      }
    }
  }
})
