import assert from 'node:assert/strict';
import http from 'node:http';
import {createReadStream,existsSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=process.env.FALL_FEST_OUT||'/home/bruce/output/island-delicacy-fall-fest-web';mkdirSync(OUT,{recursive:true});
const {chromium}=await import('/home/bruce/open-design/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright/index.mjs');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>{let rel=decodeURIComponent(req.url.split('?')[0]);if(rel.endsWith('/'))rel+='index.html';const f=path.join(ROOT,rel);if(!f.startsWith(ROOT)||!existsSync(f)||!statSync(f).isFile()){res.writeHead(404);res.end('not found');return;}res.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream'});createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=process.env.TEST_BASE_URL||`http://127.0.0.1:${server.address().port}`;const browser=await chromium.launch();const checks=[];
const expected=[['Oxtail','$35'],['Curry Chicken','$25'],['Jerk Chicken','$25'],['Barbi-fried Chicken','$25']];
try{
 for(const width of [320,390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:width>1000?1000:844}});const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/squareup|checkout|workers\.dev/.test(r.url()))requests.push(r.url());});
  await page.clock.install({time:new Date('2026-09-15T12:00:00-07:00')});
  await page.goto(base+'/events/home-church-fall-fest/',{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
  assert.deepEqual(await page.locator('.meal-list li').evaluateAll(es=>es.map(e=>[e.querySelector('h3').textContent,e.querySelector('.meal-price').textContent])),expected);
  assert.equal(await page.locator('h1').innerText(),'Home Church\nFall Fest');
  assert.equal(await page.locator('[data-fall-state]').textContent(),'One night only');
  assert.ok(await page.locator('.price-note').innerText().then(t=>t.includes('Prices shown apply to this event')));
  assert.equal(await page.locator('.drink-only strong').innerText(),'$6');
  assert.ok(await page.locator('.directions').getAttribute('href').then(h=>h.includes('766%2028th%20St')));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'event overflow '+width);
  assert.ok(await page.locator('img').evaluateAll(es=>es.every(e=>e.complete&&e.naturalWidth>0)));
  await page.screenshot({path:`${OUT}/event-${width}.png`,fullPage:true});
  await page.locator('.menu-jump').click();await page.waitForTimeout(700);assert.ok(await page.evaluate(()=>Math.abs(document.querySelector('#event-menu').getBoundingClientRect().top)<50));
  if(width===390)await page.screenshot({path:`${OUT}/menu-mobile-detail.png`});
  await page.goto(base+'/connect/',{waitUntil:'networkidle'});assert.ok(await page.locator('[data-fall-feature]').isVisible());assert.equal(await page.locator('.connect-link').count(),7);assert.equal(await page.getByRole('link',{name:'TikTok @islanddelicacyllc'}).getAttribute('href'),'https://www.tiktok.com/@islanddelicacyllc?_r=1&_t=ZP-99lLZZdzyJi');assert.equal(await page.getByRole('link',{name:'Instagram @islanddelicacyllc'}).getAttribute('href'),'https://www.instagram.com/islanddelicacyllc');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(width===390)await page.screenshot({path:`${OUT}/connect-mobile.png`,fullPage:true});
  await page.locator('[data-fall-feature]').click();assert.ok(page.url().includes('/events/home-church-fall-fest/'));
  await page.goto(base+'/',{waitUntil:'networkidle'});assert.ok(await page.locator('[data-fall-feature]').isVisible());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(width===1440||width===390)await page.screenshot({path:`${OUT}/home-${width}.png`});
  await page.locator('[data-fall-feature] a').click();assert.ok(page.url().includes('/events/home-church-fall-fest/'));
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);checks.push({viewport:width,menu:true,assets:true,homepageToMenu:true,hubToMenu:true,noErrors:true,noCheckoutTraffic:true});await page.close();
 }
 for(const [date,state,visible] of [['2026-10-31T18:00:00-07:00','Happening tonight',true],['2026-10-31T20:30:00-07:00','Past event',false],['2026-11-02T12:00:00-08:00','Past event',false]]){
  const p=await browser.newPage();await p.clock.install({time:new Date(date)});await p.goto(base+'/events/home-church-fall-fest/');assert.equal(await p.locator('[data-fall-state]').textContent(),state);assert.equal(await p.locator('[data-fall-archive]').isVisible(),!visible);assert.equal(await p.locator('.meal-list li').count(),4);
  for(const route of ['/','/connect/']){await p.goto(base+route);assert.equal(await p.locator('[data-fall-feature]').isVisible(),visible);}
  checks.push({date,state,promotionVisible:visible});await p.close();
 }
 const nojs=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});await nojs.goto(base+'/events/home-church-fall-fest/');assert.equal(await nojs.locator('.meal-list li').count(),4);assert.ok(await nojs.locator('body').innerText().then(t=>t.includes('Barbi-fried Chicken')));checks.push({noJavaScriptMenu:true});await nojs.close();
 writeFileSync(OUT+'/browser-verification.json',JSON.stringify({status:'PASS',checks},null,2));console.log(JSON.stringify({status:'PASS',checks},null,2));
}catch(e){writeFileSync(OUT+'/browser-verification.json',JSON.stringify({status:'FAIL',message:e.message,stack:e.stack,checks},null,2));throw e;}finally{await browser.close();server.close();}
