import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveScraper } from '../scrapers/almosafer-live.js';
import { createRoomInventoryStore } from '../room-inventory.js';
import { executeHotelComparison } from '../scrapers/index.js';

const params={hotelInput:'https://www.almosafer.com/ar/hotel/details/atg/hotel-1234567',
  checkIn:'2026-11-01',checkOut:'2026-12-01',adults:2,rooms:1,children:0,childAges:[],sources:['almosafer']};
const details={hotelId:'1234567',hotelName:'فندق القمة',baseSlug:'hotel/details/atg/hotel-1234567'};
const quote=(date,price=100)=>({classic:{name:'كلاسيك',beds:[],offers:{roomOnly:{price,packageId:`package-${date}-${price}`}}}});
const noSleep=async()=>{};

test('A month recovers beyond the first ten repaired nights and never repeats a successful or verified empty date',async()=>{
  const calls=new Map(),progress=[],delays=[];
  const scrape=createLiveScraper(async()=>details,async(p,options)=>{
    const day=Number(p.checkIn.slice(-2)),n=(calls.get(day)||0)+1;calls.set(day,n);
    if(day===30)return {};
    if(n>1){assert.equal(options.freshSession,true);assert.equal(options.refresh,true);}
    // Three nights work initially, ten more on round one, the rest on round two.
    if(day>3 && n<(day<=13?2:3))throw new Error('Temporary source timeout');
    return quote(p.checkIn,day*10);
  },{sleep:async ms=>delays.push(ms)});
  const [room]=await scrape({...params,onProgress:p=>progress.push(p)});
  assert.equal(room.roomOnlyAvailableNights,29);
  assert.equal(room.dailyRates[29].availability,'unavailable');
  assert.equal(calls.get(1),1);assert.equal(calls.get(13),2);assert.equal(calls.get(29),3);assert.equal(calls.get(30),1);
  assert.equal(room.dailyRates[0].offers.roomOnly.packageId,'package-2026-11-01-10');
  assert.deepEqual(room.warnings,[]);assert.equal(room.roomOnlyTotalPrice,null);
  assert.deepEqual(delays,[1000]);
  assert.ok(progress.some(p=>p.repairRound===2&&p.repairTotal===16));
});

test('Persistent failures are bounded; a later bulk retry keeps good nights and updates all totals from recovered source packages',async()=>{
  const inventoryStore=createRoomInventoryStore(),calls=new Map();let recover=false;
  const input={...params,checkOut:'2026-11-05',rooms:2,children:1,childAges:[7]};
  const scrape=createLiveScraper(async()=>details,async(p,options)=>{
    const n=(calls.get(p.checkIn)||0)+1;calls.set(p.checkIn,n);
    assert.deepEqual(p.roomsInfo,[{adultsCount:2,kidsAges:[7]},{adultsCount:2,kidsAges:[7]}]);
    if(p.checkIn==='2026-11-02'&&!recover)throw new Error('Temporary source timeout');
    if(p.checkIn==='2026-11-03'&&!recover)return {};
    if(recover)assert.equal(options.freshSession,true);
    return quote(p.checkIn,recover?200:100);
  },{inventoryStore,sleep:noSleep});
  const first=await executeHotelComparison(input,{almosafer:scrape});
  assert.ok(first.retryInventoryId);assert.equal(calls.get('2026-11-02'),4);
  assert.equal(first.data[0].dailyRates[1].availability,'error');
  recover=true;
  const next=await executeHotelComparison({...input,retryInventoryId:first.retryInventoryId,retryRoomIdentity:'classic'},{almosafer:scrape});
  assert.deepEqual(next.data[0].dailyRates.map(d=>d.roomOnlyPrice),[100,200,200,100]);
  assert.equal(next.data[0].roomOnlyTotalPrice,1200);
  assert.equal(next.summary.almosaferRoomOnly,1200);
  assert.equal(calls.get('2026-11-01'),1);assert.equal(calls.get('2026-11-04'),1);
  assert.equal(calls.get('2026-11-03'),2);assert.deepEqual(next.warnings,[]);
  assert.notEqual(next.retryInventoryId,first.retryInventoryId);
});

test('Failed rechecks retain known prices of other rooms and mark only the missing room unverified',async()=>{
  const inventoryStore=createRoomInventoryStore();let retry=false;
  const input={...params,checkOut:'2026-11-03'};
  const scrape=createLiveScraper(async()=>details,async p=>{
    if(retry)throw new Error('Source timeout');
    return p.checkIn===input.checkIn?quote(p.checkIn):{other:{...quote(p.checkIn).classic,name:'أخرى'}};
  },{inventoryStore,sleep:noSleep});
  const first=await scrape(input);retry=true;
  const next=await scrape({...input,retryInventoryId:first.retryInventoryId,retryRoomIdentity:'classic'});
  assert.equal(next.find(r=>r.roomIdentity==='other').dailyRates[1].roomOnlyPrice,100);
  assert.equal(next.find(r=>r.roomIdentity==='other').dailyRates[1].availability,'available');
  assert.equal(next.find(r=>r.roomIdentity==='classic').dailyRates[1].availability,'error');
  assert.equal(next.find(r=>r.roomIdentity==='classic').dailyRates[0].roomOnlyPrice,100);
});

test('Single-night repair updates the reusable month snapshot and cannot reintroduce old failed days on the next retry',async()=>{
  const inventoryStore=createRoomInventoryStore(),calls=[];let retry=false;
  const input={...params,checkOut:'2026-11-04'};
  const scrape=createLiveScraper(async()=>details,async p=>{
    calls.push(p.checkIn);
    return p.checkIn===input.checkIn||retry?quote(p.checkIn,retry?200:100):{};
  },{inventoryStore,sleep:noSleep});
  const first=await scrape(input);retry=true;calls.length=0;
  const single=await scrape({...input,retryInventoryId:first.retryInventoryId,retryDates:['2026-11-02']});
  assert.deepEqual(calls,['2026-11-02']);calls.length=0;
  const bulk=await scrape({...input,retryInventoryId:single.retryInventoryId,retryRoomIdentity:'classic'});
  assert.deepEqual(calls,['2026-11-03']);
  assert.deepEqual(bulk[0].dailyRates.map(d=>d.roomOnlyPrice),[100,200,200]);
  assert.equal(bulk[0].roomOnlyTotalPrice,500);
});

test('Expired or mismatched retry snapshots fail explicitly without silently scraping a whole month',async()=>{
  let time=0;const inventoryStore=createRoomInventoryStore({now:()=>time});let calls=0;
  const input={...params,checkOut:'2026-11-02'};
  const scrape=createLiveScraper(async()=>details,async p=>{calls++;return quote(p.checkIn);},{inventoryStore,sleep:noSleep});
  const first=await scrape(input);
  for(const change of [{hotelInput:'another'},{adults:3},{rooms:2},{checkOut:'2026-11-03'},{children:1,childAges:[7]}]){
    await assert.rejects(scrape({...input,...change,retryInventoryId:first.retryInventoryId}),e=>e.status===409);
  }
  // A lost retry response may reuse the original immutable snapshot.
  assert.ok(inventoryStore.take(first.retryInventoryId,input,{withContext:true,consume:false}));
  time=1800001;
  await assert.rejects(scrape({...input,retryInventoryId:first.retryInventoryId}),e=>e.status===409);
  assert.equal(calls,1);
});

test('A refusal stops subsequent automatic rounds and a manual recheck remains explicit',async()=>{
  const inventoryStore=createRoomInventoryStore();let calls=0,manual=false;
  const input={...params,checkOut:'2026-11-03'};
  const scrape=createLiveScraper(async()=>details,async p=>{
    if(p.checkIn===input.checkIn)return quote(p.checkIn);
    calls++;
    if(manual)return quote(p.checkIn,200);
    throw Object.assign(new Error('Verification required'),{stage:'poll',responseKind:'challenge',upstreamStatus:403});
  },{inventoryStore,sleep:noSleep});
  const first=await scrape(input);assert.equal(calls,1);
  manual=true;
  const next=await scrape({...input,retryInventoryId:first.retryInventoryId,retryRoomIdentity:'classic'});
  assert.equal(calls,2);assert.equal(next[0].roomOnlyTotalPrice,300);
});
