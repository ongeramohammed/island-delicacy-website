import assert from 'node:assert/strict';
import http from 'node:http';
import {createReadStream,existsSync,statSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=process.env.EVENTS_OUT||'/home/bruce/output/island-delicacy-events-navigation';mkdirSync(OUT,{recursive:true});
const {chromium}=await import('/home/bruce/open-design/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright/index.mjs');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf','.pdf':'application/pdf','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>{let rel=decodeURIComponent(req.url.split('?')[0]);if(rel.endsWith('/'))rel+='index.html';const f=path.join(ROOT,rel);if(!f.startsWith(ROOT)||!existsSync(f)||!statSync(f).isFile()){res.writeHead(404);res.end('not found');return;}res.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream'});createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=process.env.TEST_BASE_URL||`http://127.0.0.1:${server.address().port}`;const browser=await chromium.launch();const checks=[];
try{
for(const width of [320,390,768,921,1024,1440]){
 const p=await browser.newPage({viewport:{width,height:1000}});const errors=[],traffic=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('request',r=>{if(/squareup|checkout|workers\.dev/.test(r.url()))traffic.push(r.url());});await p.clock.install({time:new Date('2026-09-17T12:00:00-07:00')});
 await p.goto(base+'/events/',{waitUntil:'networkidle'});await p.evaluate(()=>document.fonts.ready);
 assert.equal(await p.locator('h1').innerText(),'Events & Pop-Ups');assert.equal(await p.locator('[data-event-status]').textContent(),'Upcoming event');assert.equal(await p.locator('form,input').count(),0);
 assert.ok(await p.locator('.event-facts').innerText().then(t=>t.includes('October 31, 2026')&&t.includes('766 28th St')&&t.includes('5:30–8:30 PM Pacific')));
 assert.ok(await p.locator('img').evaluateAll(es=>es.every(e=>e.complete&&e.naturalWidth>0)));
 const shape=await p.locator('.event-poster img').evaluate(e=>{const r=e.getBoundingClientRect();return r.width/r.height});assert.ok(Math.abs(shape-11/17)<.001);
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:`${OUT}/events-${width}.png`,fullPage:true});
 if(width<=920){await p.locator('[data-menu-toggle]').click();assert.ok(await p.locator('.nav-links a[href="/events/"]').isVisible());await p.screenshot({path:`${OUT}/nav-${width}.png`});await p.locator('[data-menu-toggle]').click();}
 else {const nav=await p.locator('.nav').evaluate(e=>{const rs=['.brand','.nav-links','.nav-actions'].map(s=>e.querySelector(s).getBoundingClientRect());return rs.map(r=>({left:r.left,right:r.right,width:r.width}))});assert.ok(nav[0].right<=nav[1].left&&nav[1].right<=nav[2].left&&nav[2].right<=width,JSON.stringify({width,nav}));}
 assert.deepEqual(traffic,[],'events must not call checkout/backend');
 await p.getByRole('link',{name:'View event menu',exact:true}).click();assert.ok(p.url().endsWith('/events/home-church-fall-fest/'));await p.getByRole('navigation',{name:'Event navigation'}).getByRole('link',{name:'Events',exact:true}).click();assert.ok(p.url().endsWith('/events/'));
 for(const route of ['/','/order/','/catering/','/about/','/faq/']){await p.goto(base+route,{waitUntil:'networkidle'});const link=p.locator('.nav-links a[href="/events/"]');assert.equal(await link.count(),1);assert.equal(await p.locator('.footer a[href="/events/"]').count(),1);if(width<=920)await p.locator('[data-menu-toggle]').click();assert.ok(await link.isVisible());await link.click();assert.ok(p.url().endsWith('/events/'));}
 await p.goto(base+'/connect/',{waitUntil:'networkidle'});await p.locator('a[href="/events/"]').click();assert.ok(p.url().endsWith('/events/'));
 assert.deepEqual(errors,[]);checks.push({width,navOnAllPages:true,drawer:true,noOverflow:true,flyerAspect:true,menuAndHubLinks:true,noErrors:true});await p.close();
}
for(const [date,status,archived] of [['2026-10-31T17:30:00-07:00','Happening now',false],['2026-10-31T20:29:59-07:00','Happening now',false],['2026-10-31T20:30:00-07:00','Past event',true],['2027-01-01T12:00:00-08:00','Past event',true]]){
 const p=await browser.newPage({viewport:{width:390,height:1000}});await p.clock.install({time:new Date(date)});await p.goto(base+'/events/',{waitUntil:'networkidle'});assert.equal(await p.locator('[data-event-status]').textContent(),status);assert.equal(await p.locator('[data-event-archive]').isVisible(),archived);assert.equal(await p.locator('[data-events-empty]').isVisible(),archived);assert.equal(await p.locator('.event-poster img').count(),1);await p.locator('[data-menu-toggle]').click();assert.ok(await p.locator('.nav-links a[href="/events/"]').isVisible());await p.locator('[data-menu-toggle]').click();if(archived)await p.screenshot({path:`${OUT}/events-archive.png`,fullPage:true});checks.push({date,status,permanentNav:true,archived});await p.close();
}
const p=await browser.newPage({javaScriptEnabled:false});await p.goto(base+'/events/');assert.equal(await p.locator('[data-event-status]').textContent(),'Community event');assert.equal(await p.locator('time').innerText(),'Saturday, October 31, 2026');assert.equal(await p.locator('a[href="/events/home-church-fall-fest/"]').count(),1);checks.push({noJavaScriptReadable:true});await p.close();
const response=await browser.newContext();const pdf=await response.request.get(base+'/assets/events/fall-fest/flyer-approved.pdf');assert.equal(pdf.status(),200);assert.equal(createHash('sha256').update(await pdf.body()).digest('hex'),createHash('sha256').update(readFileSync(path.join(ROOT,'assets/events/fall-fest/flyer-approved.pdf'))).digest('hex'));await response.close();checks.push({approvedPdfAvailableUnmodified:true});
writeFileSync(OUT+'/verification.json',JSON.stringify({status:'PASS',base,checks},null,2));console.log(JSON.stringify({status:'PASS',base,checks},null,2));
}catch(e){writeFileSync(OUT+'/verification.json',JSON.stringify({status:'FAIL',message:e.message,checks},null,2));throw e;}finally{await browser.close();server.close();}
