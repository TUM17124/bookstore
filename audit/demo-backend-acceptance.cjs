const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const backend = new URL(process.argv[2]);
  if (!['localhost', '127.0.0.1'].includes(backend.hostname)) throw new Error('Local test API required');
  const output = path.resolve('audit/experience/demo-real-api');
  fs.mkdirSync(output, {recursive:true});
  const browser = await chromium.launch({channel:'msedge'});
  try {
    for (const theme of ['light','dark']) for (const width of [390,1440]) {
      const context = await browser.newContext({viewport:{width,height:900}});
      const page = await context.newPage();
      await page.addInitScript(value => localStorage.setItem('theme',value), theme);
      await page.route('**/theme-tokens.css', async route => {
        const response = await route.fetch({url:'http://127.0.0.1:3100/theme-tokens.css'});
        await route.fulfill({response});
      });
      // Route public API requests to real Django; do not fabricate API responses.
      await page.route('**/api/**', async route => {
        const original = new URL(route.request().url());
        const response = await route.fetch({url:backend.origin+original.pathname+original.search});
        await route.fulfill({response});
      });
      await page.goto('http://127.0.0.1:3100/showcase/');
      await page.getByRole('heading',{name:'Hard-drive DEMO / NOT FOR SALE',exact:true}).click();
      const panel = page.getByRole('region',{name:'Auction simulation'});
      await expect(panel.getByText('Upcoming simulation',{exact:true})).toBeVisible();
      await panel.getByRole('button',{name:'Start simulation now'}).click();
      await expect(panel.getByText('Live simulation',{exact:true})).toBeVisible();
      await panel.getByLabel('Trial maximum').fill('200');
      await panel.getByRole('button',{name:'Submit simulated bid'}).click();
      await expect(panel.getByText('Leading synthetic alias: Demo bidder ••01',{exact:true})).toBeVisible();
      await panel.getByRole('button',{name:'Jump to final seconds'}).click();
      await panel.getByLabel('Synthetic participant').selectOption('B');
      await panel.getByLabel('Trial maximum').fill('200');
      await panel.getByRole('button',{name:'Submit simulated bid'}).click();
      await expect(panel.getByText('Extensions demonstrated: 1',{exact:true})).toBeVisible();
      await expect(panel.getByText(/^Simulated current bid: KES 200(?:\.00)?$/)).toBeVisible();
      await expect(panel.getByText('Leading synthetic alias: Demo bidder ••01',{exact:true})).toBeVisible();
      await panel.getByLabel('Local demonstration message').fill('<script>not executable</script>');
      await panel.getByRole('button',{name:'Add local message'}).click();
      await expect(panel.getByRole('list',{name:'Local demo messages'})).toContainText('<script>not executable</script>');
      await panel.getByRole('button',{name:'Finish and show outcome'}).click();
      await expect(panel.getByText(/Simulated winner:.*No payment is due/)).toBeVisible();
      await expect(page.getByRole('button',{name:/Buy Now|Pay now|Place bid/i})).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({path:path.join(output,`${theme}-${width}.png`),fullPage:true});
      const share = await page.goto(`${backend.origin}/api/marketplace/demo-showcase/test-stock-item/share/`);
      expect(share.headers()['x-robots-tag']).toBe('noindex, nofollow');
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /DEMO/);
      await expect(page.getByText(/demonstration chat is local to your browser tab/)).toBeVisible();
      const preview = page.locator('img');
      await expect(preview).toBeVisible();
      await expect.poll(() => preview.evaluate(image => image.naturalWidth)).toBe(1200);
      await page.screenshot({path:path.join(output,`social-${theme}-${width}.png`),fullPage:true});
      await context.close();
    }
    console.log('PASS: four real-API browser scenarios; proxy tie, extension, outcome, local text safety, no purchase controls.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1)});
