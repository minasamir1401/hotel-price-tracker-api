// Standalone UI regression: build ../frontend first, then run this file.
// All source responses are local fixtures; no supplier calls or API keys.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createLiveScraper} from '../scrapers/almosafer-live.js';
import {createRoomInventoryStore} from '../room-inventory.js';
import {executeHotelComparison} from '../scrapers/index.js';

test('Mobile UI bulk and single-night retries retain good quotes, keep results on errors, and use the latest month snapshot',async()=>{
  const root=fileURLToPath(new URL('../../frontend/dist/',import.meta.url));
  const output=fileURLToPath(new URL('../../outputs/night-recovery-ui/',import.meta.url));
  const hotel='https://www.almosafer.com/ar/hotel/details/atg/hotel-1234567';
  const input={hotelInput:hotel,checkIn:'2026-11-01',checkOut:'2026-11-04',sources:['almosafer']};
  const calls=[],requests=[],errors=[];let mode='initial',browser;
  const scrape=createLiveScraper(async()=>({hotelId:'1234567',hotelName:'فندق القمة',baseSlug:'hotel/details/atg/hotel-1234567'}),async p=>{
    calls.push(p.checkIn);
    if(mode==='initial'&&p.checkIn==='2026-11-02')throw new Error('Temporary timeout');
    if(mode==='initial'&&p.checkIn==='2026-11-03')return {};
    const price=Number(p.checkIn.slice(-2))*100;
    return {classic:{name:'كلاسيك',beds:[],offers:{roomOnly:{price,packageId:`quote-${p.checkIn}`}}}};
  },{inventoryStore:createRoomInventoryStore(),sleep:async()=>{}});
  const server=createServer(async(req,res)=>{
    try {
      const pathname=new URL(req.url,'http://localhost').pathname;
      const path=resolve(root,pathname==='/'?'index.html':`.${pathname}`);
      if(!path.startsWith(resolve(root)))throw new Error('Invalid asset path');
      const content=await readFile(path);
      const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png'};
      res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream'});res.end(content);
    } catch {res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:390,height:844}});
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/**',async route=>{
      const path=new URL(route.request().url()).pathname;
      const body=route.request().postDataJSON();
      let result;
      if(path.endsWith('/system-status'))result={almosafer:'ready',almatar:'unchecked',booking:'unchecked',nusuk:'unchecked',errors:[]};
      else if(path.endsWith('/hotel-rooms-list'))result={success:true,rooms:['كلاسيك'],roomAvailability:[],warnings:[],hotelName:'فندق القمة',hotelId:'1234567'};
      else if(path.endsWith('/search-hotel-prices')){
        requests.push(body);
        result=mode==='fail'?{success:false,message:'تعذر الاتصال التجريبي'}:await executeHotelComparison(body,{almosafer:scrape,almatar:async()=>[]});
      } else result={success:true};
      await route.fulfill({json:result});
    });
    const url=new URL(`http://127.0.0.1:${server.address().port}/`);
    for(const [key,value] of Object.entries({...input,hotel,source:'almosafer'}))if(typeof value==='string')url.searchParams.set(key,value);
    await page.goto(url.href);
    await page.getByRole('button',{name:'بحث واستخراج الأسعار المباشرة'}).click();
    const bulk=page.getByRole('button',{name:/إعادة التحقق من كل الليالي الناقصة/});
    await bulk.waitFor();
    assert.match(await bulk.innerText(),/\(2\)/);
    assert.equal(calls.filter(d=>d==='2026-11-01').length,1);
    await mkdir(output,{recursive:true});
    await bulk.locator('..').screenshot({path:resolve(output,'retry-mobile.png')});
    mode='fail';await page.getByRole('button',{name:'بحث واستخراج الأسعار المباشرة'}).click();
    await page.getByRole('alert').filter({hasText:'تعذر الاتصال التجريبي'}).waitFor();
    assert.match(await bulk.innerText(),/\(2\)/);
    assert.equal(await page.locator('#selected-room').count(),1,'Results remain visible after a failed retry');
    assert.ok(requests.at(-1).retryInventoryId,'Submitting the same partial search resumes its missing nights');
    mode='recover';
    await page.getByRole('button',{name:'إعادة التحقق من يوم 2026-11-02',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#selected-room')?.textContent.includes('2/3'));
    assert.match(await bulk.innerText(),/\(1\)/);
    const singleRequest=requests.at(-1);
    assert.equal(singleRequest.checkIn,input.checkIn);assert.equal(singleRequest.checkOut,input.checkOut);
    assert.deepEqual(singleRequest.retryDates,['2026-11-02']);
    const snapshotUsedForSingle=singleRequest.retryInventoryId;
    await bulk.click();
    await page.waitForFunction(()=>document.querySelector('#selected-room')?.textContent.includes('مكتملة 100%'));
    assert.equal(await bulk.count(),0);
    assert.notEqual(requests.at(-1).retryInventoryId,snapshotUsedForSingle,'Bulk retry uses the updated snapshot');
    assert.equal(calls.filter(d=>d==='2026-11-01').length,1);
    assert.equal(calls.filter(d=>d==='2026-11-02').length,5);
    assert.equal(calls.filter(d=>d==='2026-11-03').length,2);
    await page.getByRole('button',{name:'تحديث كل الأسعار من المصدر'}).click();
    await page.waitForFunction(()=>document.querySelector('#selected-room')?.textContent.includes('مكتملة 100%'));
    assert.equal(calls.filter(d=>d==='2026-11-01').length,2,'An explicit full refresh still requests every night');
    assert.equal(requests.at(-1).retryInventoryId,undefined);
    assert.deepEqual(errors,[]);
  } catch(error) {
    console.error(error);
    throw error;
  } finally {
    if(browser)await browser.close();
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  }
});
