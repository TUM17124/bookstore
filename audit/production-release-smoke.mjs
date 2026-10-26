import {chromium} from '@playwright/test';
import fs from 'node:fs';
const output='audit/experience/production-20261026';
fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge'});
const page=await browser.newPage({viewport:{width:390,height:900}});
const failures=[];
page.on('response',r=>{if(r.status()>=500)failures.push({url:r.url(),status:r.status()});});
try {
  for(const route of ['/','/marketplace/','/books/','/publish/','/wishlist/','/purchases/','/seller/listings/','/showcase/','/login/','/signup/']){
    const response=await page.goto('https://plugyard.com'+route,{waitUntil:'networkidle',timeout:45000});
    const text=await page.locator('main').innerText();
    const logos=await page.locator('img[alt="PlugYard"]').evaluateAll(images=>images.map(i=>({loaded:i.complete&&i.naturalWidth>0,src:i.getAttribute('src')})));
    const bookLinks=await page.locator('a[href*="/b/"]').count();
    await page.screenshot({path:output+'/'+(route.replaceAll('/','-')||'home')+'.png',fullPage:true});
    console.log(JSON.stringify({route,status:response.status(),heading:text.slice(0,220),logos,bookLinks}));
    if(response.status()!==200||!text.trim()||logos.some(l=>!l.loaded))throw new Error('Rendered smoke failed: '+route);
    if(route==='/books/'&&!/Page 1 · [1-9]\d* books/.test(text))throw new Error('Books department has no loaded books');
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('https://plugyard.com/',{waitUntil:'networkidle'});
  await page.screenshot({path:output+'/home-desktop.png',fullPage:true});
  console.log(JSON.stringify({http500:failures}));
  if(failures.length)throw new Error('HTTP500 observed');
}finally{await browser.close();}
