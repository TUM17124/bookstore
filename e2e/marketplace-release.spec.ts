import { expect, test, type Page } from "@playwright/test"

const token = `x.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString("base64url")}.x`

const listing = {
  id: 7, seller: { id: 2, name: "Test Seller", slug: "test-seller", verified: true }, category: "electronics",
  title: "Test Laptop", slug: "test-laptop", description_text: "A production-like test listing.",
  condition: "used", condition_and_defects: "Small lid scratch", price_type: "fixed", price_amount: "45000.00",
  price_min: null, price_max: null, currency: "KES", country: "KE", administrative_area: "Nairobi", locality: "Nairobi",
  fulfillment_type: "shipping", sale_mode: "auction", published_at: "2026-10-20T10:00:00Z", status: "active",
  moderation_status: "approved", seller_return_condition: "statutory", delivery_options: [{ code: "nationwide", label: "Kenya nationwide", fee: "500", countries: ["KE"] }],
  media: [], viewer: { mode: "gallery", config: {} }, url: "/listings/test-laptop", legacy_book_id: null,
}

async function authenticated(page: Page) {
  await page.addInitScript((value) => localStorage.setItem("access_token", value), token)
}

async function commonApi(page: Page) {
  await page.route("**/api/site-config/**", (route) => route.fulfill({ json: {} }))
  await page.route("**/api/notifications/**", (route) => route.fulfill({ json: { count: 0, results: [] } }))
  await page.route("**/api/wishlist/status/**", (route) => route.fulfill({ json: {} }))
}

test("wishlist renders universal products and removes without reload", async ({ page }) => {
  await authenticated(page); await commonApi(page)
  await page.route("**/api/wishlist/?**", (route) => route.fulfill({ json: { count: 1, next: null, previous: null, results: [{ id: 3, listing, created_at: "2026-10-20T10:00:00Z" }] } }))
  await page.route("**/api/wishlist/7/", (route) => route.fulfill({ status: 204 }))
  await page.goto("/wishlist/")
  await expect(page.getByRole("heading", { name: "Wishlist" })).toBeVisible()
  await expect(page.getByText("Test Laptop")).toBeVisible()
  await page.getByRole("button", { name: "Remove Test Laptop from wishlist" }).click()
  await expect(page.getByText("Test Laptop")).toHaveCount(0)
})

test("guest secure order shows disclosures and buyer confirmation", async ({ page }) => {
  await commonApi(page)
  await page.route("**/api/marketplace/purchases/41/guest-access/**", (route) => route.fulfill({ json: { id: 41, title: "Test Laptop", seller: "Test Seller", amount: "45500.00", currency: "KES", payment_status: "paid", fulfillment_status: "awaiting_buyer_confirmation", known_defects: "Small lid scratch", return_terms: "Statutory rights apply" } }))
  await page.route("**/api/marketplace/purchases/41/confirm-receipt/", (route) => route.fulfill({ json: { ok: true } }))
  await page.goto("/guest-order/?purchase=41&access_token=scoped-test-token")
  await expect(page.getByText("Small lid scratch")).toBeVisible()
  await page.getByRole("button", { name: "Confirm Receipt & Satisfaction" }).click()
  await expect(page.getByText(/Fulfillment: completed/i)).toBeVisible()
})

test("auction bid is server-confirmed and winner checkout requires legal acceptance", async ({ page }) => {
  await authenticated(page); await commonApi(page)
  const auction = { id: 11, listing, seller: { name: "Test Seller", slug: "test-seller", verified: true }, title: "Laptop auction", slug: "laptop-auction", status: "live", outcome: "", currency: "KES", starting_bid: "10000.00", minimum_increment: "500.00", has_reserve: true, reserve_met: false, buy_now_price: null, proxy_bidding_enabled: true, public_chat_enabled: false, anonymous_bidding_enabled: true, anti_snipe_enabled: true, extension_trigger_seconds: 30, extension_duration_seconds: 30, maximum_extensions: 3, extensions_used: 0, starts_at: "2026-10-20T10:00:00Z", ends_at: "2099-10-20T11:00:00Z", payment_deadline_hours: 12, payment_due_at: null, current_bid: "10000.00", required_next_bid: "10500.00", bid_count: 0, watching_count: 0, recent_bids: [], server_now: "2026-10-20T10:30:00Z", revision: 1, is_watching: false, my_maximum: null, purchase_id: null }
  await page.route("**/api/marketplace/auctions/?", (route) => route.fulfill({ json: { count: 1, page: 1, results: [auction] } }))
  await page.route("**/api/marketplace/auctions/laptop-auction/", (route) => route.fulfill({ json: auction }))
  await page.route("**/api/marketplace/auctions/11/state/**", (route) => route.fulfill({ json: { unchanged: true, revision: 1, server_now: new Date().toISOString(), auction: null } }))
  await page.route("**/api/marketplace/auctions/11/bids/", async (route) => route.fulfill({ json: { created: true, auction: { ...auction, current_bid: "10500.00", bid_count: 1, revision: 2 } } }))
  await page.goto("/auctions/?auction=laptop-auction")
  await expect(page.getByText("Known Defects / Important Disclosures")).toBeVisible()
  await page.getByLabel(/accept the auction terms/i).check()
  await page.getByRole("button", { name: "Place server-verified bid" }).click()
  await expect(page.getByText("Your bid was accepted by the server.")).toBeVisible()
})

test("core purchase surfaces fit a 320px mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 }); await commonApi(page)
  await page.route("**/api/marketplace/purchases/41/guest-access/**", (route) => route.fulfill({ json: { id: 41, title: "Test Laptop", seller: "Test Seller", amount: "45500.00", currency: "KES", payment_status: "paid", fulfillment_status: "awaiting_buyer_confirmation", known_defects: "Small lid scratch", return_terms: "Statutory rights apply" } }))
  await page.goto("/guest-order/?purchase=41&access_token=scoped-test-token")
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await expect(page.getByRole("button", { name: "Confirm Receipt & Satisfaction" })).toBeVisible()
})
