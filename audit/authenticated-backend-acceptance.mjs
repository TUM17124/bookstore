import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

(async () => {
  const backend = new URL(process.argv[2]);
  if (!['localhost', '127.0.0.1'].includes(backend.hostname)) throw new Error('Local test API required');
  const output = path.resolve('audit/experience/authenticated-real-api');
  fs.mkdirSync(output, {recursive:true});
  const browser = await chromium.launch({channel:'msedge'});
  try {
    const page = await browser.newPage({viewport:{width:390,height:900}});
    await page.route('**/api/**', async route => {
      const original = new URL(route.request().url());
      const response = await route.fetch({url:backend.origin+original.pathname+original.search});
      await route.fulfill({response});
    });
    await page.goto('http://127.0.0.1:3100/login/?next=/sell/');
    await page.getByPlaceholder('Email', {exact:true}).fill('browser@example.test');
    await page.getByPlaceholder('Password', {exact:true}).fill(process.env.BROWSER_TEST_PASSWORD);
    await page.getByRole('button',{name:'Log in',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Create a listing'})).toBeVisible({timeout:30000});
    await page.getByRole('combobox').first().selectOption('browser-product');
    await page.getByLabel('Title',{exact:true}).fill('Synthetic browser product');
    await page.getByLabel('Description',{exact:true}).fill('Isolated publishing acceptance fixture, not a real offer.');
    await page.getByLabel('Price',{exact:true}).fill('100');
    await expect(page.locator('[name="attr.model"]')).toHaveAttribute('required','');
    await page.locator('[name="attr.model"]').fill('Test model');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
    for (const side of ['front','back','left','right','top','bottom']) {
      await page.locator(`[name="media.${side}"]`).setInputFiles({name:`${side}.png`,mimeType:'image/png',buffer:png});
    }
    await page.getByRole('button',{name:'Submit listing',exact:true}).click();
    await expect(page.getByRole('status').filter({hasText:'Your listing was submitted for review.'})).toBeVisible({timeout:30000});
    await page.screenshot({path:path.join(output,'product-published-mobile.png'),fullPage:true});
    await page.goto('http://127.0.0.1:3100/sell/?category=browser-service');
    await page.getByRole('combobox').first().selectOption('browser-service');
    await page.getByLabel('Title',{exact:true}).fill('Synthetic browser service');
    await page.getByLabel('Description',{exact:true}).fill('A synthetic defined service deliverable for isolated acceptance.');
    await page.getByLabel('Price',{exact:true}).fill('100');
    await page.getByRole('button',{name:'Submit listing',exact:true}).click();
    await expect(page.getByRole('status').filter({hasText:'Your listing was submitted for review.'})).toBeVisible({timeout:30000});
    await page.screenshot({path:path.join(output,'service-published-mobile.png'),fullPage:true});
    console.log('PASS: real login, inherited required attribute, six image uploads, product and service submission.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1)});
