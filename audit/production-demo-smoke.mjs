import {chromium,expect} from '@playwright/test';
const browser=await chromium.launch({channel:'msedge'});
try{
 const page=await browser.newPage({viewport:{width:390,height:900}});
 page.on('response',r=>{if(r.url().includes('/api/'))console.log('API',r.status(),new URL(r.url()).pathname);});
 page.on('requestfailed',r=>console.log('NETWORK',new URL(r.url()).pathname,r.failure()?.errorText));
 const response=await page.request.get('https://plugyard.com/api/marketplace/demo-showcase/');
 const data=await response.json();
 expect(data.count).toBe(9);
 const disk=data.results.find(r=>r.title.startsWith('Seagate 1TB'));
 expect(disk.demo_auction).toBeTruthy();
 await page.goto('https://plugyard.com/showcase/?listing='+encodeURIComponent(disk.slug),{waitUntil:'domcontentloaded'});
 for(const name of ['Not now','Close']){
  const button=page.getByRole('button',{name,exact:true});
  if(await button.count()===1&&await button.isVisible())await button.click();
 }
 const simulation=page.getByRole('region',{name:'Auction simulation'});
 try { await expect(simulation).toBeVisible({timeout:30000}); }
 catch(error){console.log('VISIBLE_MAIN',await page.locator('main').innerText());await page.screenshot({path:'audit/experience/production-20261026/demo-failure.png',fullPage:true});throw error;}
 await simulation.getByRole('button',{name:'Start simulation now',exact:true}).click();
 await expect(simulation.getByRole('status')).toHaveText('Live simulation');
 await simulation.getByRole('button',{name:'Submit simulated bid',exact:true}).click();
 await expect(simulation.getByText(/Leading synthetic alias: Demo bidder ••01/)).toBeVisible();
 await simulation.getByRole('button',{name:'Finish and show outcome',exact:true}).click();
 await expect(simulation.getByText(/Simulated winner: Demo bidder ••01/)).toBeVisible();
 await expect(simulation.getByText(/No payment is due/)).toBeVisible();
 const images=await page.locator('main img').evaluateAll(items=>items.map(i=>({src:i.getAttribute('src'),loaded:i.complete&&i.naturalWidth>0})));
 expect(images.every(i=>i.loaded)).toBeTruthy();
 await page.screenshot({path:'audit/experience/production-20261026/demo-auction-mobile.png',fullPage:true});
 const share=await page.request.get('https://plugyard.com'+disk.url);
 expect(share.status()).toBe(200);expect(share.headers()['x-robots-tag']).toContain('noindex');
 console.log(JSON.stringify({demoCount:data.count,diskSlug:disk.slug,simulation:'PASS',images:images.length,share:share.status(),noRealBids:true}));
}finally{await browser.close();}
