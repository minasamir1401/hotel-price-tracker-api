import test from 'node:test';
import assert from 'node:assert/strict';
import {createEnigmaClient,parsePackages} from '../scrapers/enigma.js';
import {createLiveScraper,datePairs} from '../scrapers/almosafer-live.js';
import {resolveAlmosaferDetails} from '../scrapers/almosafer.js';
import {buildComparison} from '../scrapers/index.js';
import {readBedOptions,matchBeds,validateBedFilter} from '../scrapers/beds.js';
import {createAlmosaferSessionProvider} from '../scrapers/almosafer-session.js';
const payload={hotelId:'1287944',checkIn:'2026-10-25',checkOut:'2026-10-26',currency:'SAR',roomsInfo:[{adultsCount:2,kidsAges:[]}]};
const offer=(basis,total,flex=false,name='غرفة ستاندرد',roomCount=1)=>({bookable:true,packageId:`${basis}-${total}`,rooms:Array.from({length:roomCount},()=>({roomName:{ar:name},roomBasis:basis})),packageRateInfo:{total,currency:'SAR'},cancellationPolicy:{hasFreeCancellation:flex}});
const poll=(packages,status='COMPLETED_SUCCESSFULLY')=>({hotelId:1287944,currencyCode:'SAR',numberOfNights:1,pollingStatus:status,packagesGroups:[{title:{ar:'غرفة ستاندرد'},packages}]});
const response=data=>({ok:true,json:async()=>data});

const sessionPage = token => ({ok:true,text:async()=>`<script type="application/json" id="__NEXT_DATA__">${JSON.stringify({props:{pageProps:{APIToken:token}}})}</script>`});

test('Public web session is shared during concurrent bootstrap, expires, and never falls back to a stale token',async()=>{
  let time=0,requests=0;
  const session=createAlmosaferSessionProvider({now:()=>time,cacheTTL:100,fetchImpl:async url=>{
    requests++;const parsed=new URL(url);assert.equal(parsed.hostname,'www.almosafer.com');
    assert.equal(parsed.searchParams.get('checkin'),'25-10-2026');
    return sessionPage(`web-${requests}`);
  }});
  const tokens=await Promise.all([session(payload,1000),session(payload,1000)]);
  assert.deepEqual(tokens,['web-1','web-1']);assert.equal(requests,1);
  assert.equal(await session(payload,1000),'web-1');time=101;
  assert.equal(await session(payload,1000),'web-2');
  const invalid=createAlmosaferSessionProvider({fetchImpl:async()=>({ok:true,text:async()=>'<html>no session</html>'})});
  await assert.rejects(invalid(payload,Date.now()+1000),/جلسة ويب/);
});

test('Session bootstrap encodes all rooms and child ages using the official web query format',async()=>{
  const session=createAlmosaferSessionProvider({fetchImpl:async url=>{
    assert.equal(new URL(url).searchParams.get('rooms'),'2_adult,2_child,5-8_age*3_adult');
    return sessionPage('web');
  }});
  await session({...payload,roomsInfo:[{adultsCount:2,kidsAges:[5,8]},{adultsCount:3,kidsAges:[]}]},Date.now()+1000);
});

test('Hotel prices use the current public web token without the header that excludes the cheaper supplier',async()=>{
  const calls=[];
  const cheaper={...offer('RO',807.66),vendorSupplierId:100010,contractId:10265};
  const dearer={...offer('RO',936.09),vendorSupplierId:100024,contractId:10193};
  const breakfast={...offer('BB',1107.34),vendorSupplierId:100024,contractId:10193};
  const client=createEnigmaClient({sleep:async()=>{},fetchImpl:async(url,options)=>{
    calls.push({url,options});
    if(!url.includes('/api/'))return sessionPage('current-public-web');
    assert.equal(options.headers.token,'current-public-web');
    assert.equal(options.headers['x-authorization'],undefined);
    if(!url.includes('/poll/'))return response({pId:'public',hotelId:1287944,initialDelayInMillis:1});
    return response(poll(options.headers['general-key']?[dearer,breakfast]:[cheaper,dearer,breakfast]));
  }});
  const result=await client({...payload,checkIn:'2026-10-20',checkOut:'2026-10-21',roomsInfo:[{adultsCount:3,kidsAges:[]}]});
  assert.equal(calls.length,3);
  const request=JSON.parse(calls[1].options.body);
  assert.equal(request.checkIn,'2026-10-20');assert.equal(request.checkOut,'2026-10-21');
  assert.deepEqual(request.roomsInfo,[{adultsCount:3,kidsAges:[]}]);assert.equal(request.currency,'SAR');
  const room=result['غرفة ستاندرد'];
  assert.equal(room.offers.roomOnly.price,807.66);assert.equal(room.offers.roomOnly.vendorSupplierId,100010);
  assert.equal(room.offers.breakfast.price,1107.34);assert.equal(room.offers.breakfast.vendorSupplierId,100024);
});

test('Failed session bootstrap cannot request or return hotel prices, and a later attempt can recover',async()=>{
  let valid=false,priceRequests=0;
  const client=createEnigmaClient({sleep:async()=>{},fetchImpl:async url=>{
    if(!url.includes('/api/'))return valid?sessionPage('new-web'):({ok:true,text:async()=>'<html>error</html>'});
    priceRequests++;
    return response(url.includes('/poll/')?poll([offer('RO',700)]):{pId:'recovered',hotelId:1287944});
  }});
  await assert.rejects(client(payload),/جلسة ويب/);assert.equal(priceRequests,0);
  valid=true;assert.equal((await client(payload))['غرفة ستاندرد'].offers.roomOnly.price,700);
});

test('Rejected web credentials refresh the public session before retrying the same booking',async()=>{
  let bootstraps=0;
  const client=createEnigmaClient({sleep:async()=>{},fetchImpl:async(url,options)=>{
    if(!url.includes('/api/'))return sessionPage(`web-${++bootstraps}`);
    if(options.headers.token==='web-1')return {ok:false,status:401};
    assert.equal(options.headers.token,'web-2');
    if(options.body)assert.deepEqual(JSON.parse(options.body),payload);
    return response(url.includes('/poll/')?poll([offer('RO',700)]):{pId:'refreshed',hotelId:1287944});
  }});
  assert.equal((await client(payload))['غرفة ستاندرد'].offers.roomOnly.price,700);
  assert.equal(bootstraps,2);
});

test('Incomplete empty polls and no-package session ids cannot masquerade as confirmed unavailability',async()=>{
  for(const invalid of [
    {pId:'no-pkg-session'},
    {...poll([]),hotelId:null,currencyCode:null,numberOfNights:0},
    {...poll([]),numberOfPackages:2},
  ]){
    let starts=0;
    const client=createEnigmaClient({token:'test',sleep:async()=>{},fetchImpl:async url=>{
      if(!url.includes('/poll/')){starts++;return response(invalid.pId?invalid:{pId:'incomplete',hotelId:1287944});}
      return response(invalid);
    }});
    await assert.rejects(client(payload),/تعذر تأكيد/);
    await assert.rejects(client(payload),/تعذر تأكيد/);
    assert.equal(starts,4,'unverified empty results must not be cached');
  }
  const validEmpty=createEnigmaClient({token:'test',sleep:async()=>{},fetchImpl:async url=>response(url.includes('/poll/')?poll([]):{pId:'verified-empty',hotelId:1287944})});
  assert.deepEqual(await validEmpty(payload),{});
});

test('Incomplete empty responses renew the public session and recover the actual day price',async()=>{
  let sessions=0;
  const client=createEnigmaClient({sleep:async()=>{},fetchImpl:async(url,options)=>{
    if(!url.includes('/api/'))return sessionPage(`web-${++sessions}`);
    if(!url.includes('/poll/'))return response({pId:'day',hotelId:1287944});
    return response(options.headers.token==='web-1'?{...poll([]),currencyCode:null,numberOfNights:0}:poll([offer('RO',807.66),offer('BB',1107.34)]));
  }});
  const room=(await client(payload))['غرفة ستاندرد'];
  assert.equal(sessions,2);assert.equal(room.offers.roomOnly.price,807.66);assert.equal(room.offers.breakfast.price,1107.34);
});

test('A no-package identifier with a verified hotel is polled like the official website before deciding availability',async()=>{
  let polls=0;
  const client=createEnigmaClient({token:'test',sleep:async()=>{},fetchImpl:async url=>{
    if(!url.includes('/poll/'))return response({pId:'no-pkg-initial',hotelId:1287944});
    polls++;return response(poll([]));
  }});
  assert.deepEqual(await client(payload,{maxAttempts:1}),{});assert.equal(polls,1);
});

test('A persistent incomplete response marks only its own night unverified in the monthly table',async()=>{
  const client=createEnigmaClient({token:'test',sleep:async()=>{},fetchImpl:async(url,options)=>{
    if(options.body){const request=JSON.parse(options.body);return response({pId:request.checkIn,hotelId:1287944,initialDelayInMillis:1});}
    return response(url.endsWith('2026-10-20')?{...poll([]),currencyCode:null,numberOfNights:0}:poll([offer('RO',807.66),offer('BB',1107.34)]));
  }});
  const scraper=createLiveScraper(async()=>({hotelId:'1287944',hotelName:'كينجزجيت',baseSlug:'hotel/details/atg/hotel-1287944'}),client);
  const params={hotelInput:'1287944',checkIn:'2026-10-19',checkOut:'2026-10-22',adults:3,rooms:1};
  const [room]=await scraper(params);
  assert.deepEqual(room.dailyRates.map(d=>d.roomOnlyPrice),[807.66,null,807.66]);
  const result=buildComparison(params,[room]);
  assert.equal(result.summary.dailyBreakdown[1].almosaferAvailability,'error');
  assert.match(result.summary.dailyBreakdown[1].almosaferError,/غير مكتملة/);
  assert.equal(room.roomOnlyTotalPrice,null);
});
test('Combined beds count all beds and cannot masquerade as a single king; alternatives remain alternatives',()=>{
  for(const label of ['1 King Bed and 2 Single Beds','١ سرير كينج و٢ سرير فردي']) {
    const bed=readBedOptions({bedding:label});
    assert.deepEqual(bed.options,[{count:3,type:'mixed',parts:[{count:1,type:'king'},{count:2,type:'single'}]}]);
    assert.equal(matchBeds([bed],validateBedFilter({bedCount:1,bedType:'king'})),'mismatch');
    assert.equal(matchBeds([bed],validateBedFilter({bedCount:3})),'matched');
  }
  const alternative=readBedOptions({bedding:'1 King Bed or 2 Single Beds'});
  assert.equal(matchBeds([alternative],validateBedFilter({bedCount:2,bedType:'single'})),'matched');
});
test('Waits for the final poll and keeps cheaper meal prices and cancellation tiers',async()=>{
  const calls=[];
  const replies=[{pId:'p1',hotelId:1287944,initialDelayInMillis:1},poll([offer('RO',700)],'IN_PROGRESS'),poll([offer('RO',714.4),offer('RO',600),offer('RO',650,true),offer('BB',841.39)])];
  const fetchDay=createEnigmaClient({token:'test',sleep:async()=>{},fetchImpl:async(url,options)=>{calls.push({url,options});return response(replies.shift());}});
  const result=await fetchDay(payload);
  assert.equal(calls.length,3);
  assert.equal(calls[0].options.headers['x-platform'],'web');
  assert.match(calls[0].options.headers['Cache-Control'],/no-store/);
  assert.equal(result['غرفة ستاندرد'].offers.roomOnly.price,600);
  assert.equal(result['غرفة ستاندرد'].offers.roomOnlyFlexible.price,650);
  assert.equal(result['غرفة ستاندرد'].offers.breakfast.price,841.39);
  assert.equal(result['غرفة ستاندرد'].offers.breakfastFlexible,undefined);
});
test('Cache expires and includes checkout, occupancy and room count; refresh skips it',async()=>{
  let time=0,requests=0,roomCount=1;
  const client=createEnigmaClient({token:'test',cacheTTL:100,now:()=>time,sleep:async()=>{},fetchImpl:async(url,options)=>{requests++;if(options.body)roomCount=JSON.parse(options.body).roomsInfo.length;return response(url.includes('/poll/')?poll([offer('RO',200,false,'غرفة ستاندرد',roomCount)]):{pId:'p',hotelId:1287944});}});
  await client(payload);await client(payload);assert.equal(requests,2);
  time=101;await client(payload);assert.equal(requests,4);
  await client({...payload,checkOut:'2026-10-27'});assert.equal(requests,6);
  await client({...payload,roomsInfo:[...payload.roomsInfo,...payload.roomsInfo]});assert.equal(requests,8);
  await client(payload,{refresh:true});assert.equal(requests,10);
});
test('A failed poll never caches a partial price and can be retried',async()=>{
  let failed=true;
  const client=createEnigmaClient({token:'test',sleep:async()=>{},fetchImpl:async(url)=>response(url.includes('/poll/')?failed?poll([offer('RO',10)],'COMPLETED_WITH_FAILURE'):poll([offer('RO',250)]):{pId:'p',hotelId:1287944})});
  await assert.rejects(client(payload),/لم يكتمل/);failed=false;
  assert.equal((await client(payload))['غرفة ستاندرد'].offers.roomOnly.price,250);
});
test('Retries a transient empty response once and waits beyond fifteen intermediate polls',async()=>{
  let starts=0,polls=0,time=0;
  const client=createEnigmaClient({token:'test',now:()=>time,sleep:async ms=>{time+=ms;},fetchImpl:async(url)=>{
    if(!url.includes('/poll/')) return response(++starts===1?{pId:'no-pkg-test'}:{pId:'p',hotelId:1287944,initialDelayInMillis:1});
    return response(++polls<17?poll([offer('RO',10)],'IN_PROGRESS'):poll([offer('RO',714.4)]));
  }});
  assert.equal((await client(payload))['غرفة ستاندرد'].offers.roomOnly.price,714.4);
  assert.equal(starts,2);assert.equal(polls,17);
});
test('A poll that never completes is bounded and cannot produce a price',async()=>{
  let time=0;
  const client=createEnigmaClient({token:'test',now:()=>time,sleep:async ms=>{time+=ms;},fetchImpl:async(url)=>response(url.includes('/poll/')?poll([offer('RO',10)],'IN_PROGRESS'):{pId:'p',hotelId:1287944,initialDelayInMillis:1})});
  await assert.rejects(client(payload),/مهلة/);assert.ok(time<=93000);
});
test('Each night and exact room is independent; missing breakfast/room/error remain null through summary',async()=>{
  const params={hotelInput:'كينجزجيت ديار',checkIn:'2026-10-23',checkOut:'2026-10-27',adults:2,rooms:1};
  const scraper=createLiveScraper(resolveAlmosaferDetails,async p=>{
    if(p.checkIn==='2026-10-26') throw new Error('network timeout');
    if(p.checkIn==='2026-10-24') return parsePackages(poll([offer('RO',400,false,'غرفة أخرى')]),2,1);
    return parsePackages(poll([offer('RO',p.checkIn==='2026-10-23'?200:714.4),...(p.checkIn==='2026-10-23'?[offer('BB',300)]:[])]),2,1);
  });
  const rooms=await scraper(params);const room=rooms.find(r=>r.roomName==='غرفة ستاندرد');
  assert.deepEqual(room.dailyRates.map(d=>d.roomOnlyPrice),[200,null,714.4,null]);
  assert.deepEqual(room.dailyRates.map(d=>d.breakfastPrice),[300,null,null,null]);
  assert.equal(room.roomOnlyTotalPrice,null);assert.equal(room.breakfastTotalPrice,null);
  const result=buildComparison(params,[room]);
  assert.equal(result.summary.dailyBreakdown[2].almosaferBreakfast,null);
  assert.equal(result.summary.dailyBreakdown[2].almosaferRoomOnly,714.4);
  assert.equal(result.summary.dailyBreakdown[3].almosaferAvailability,'error');
  assert.equal(result.summary.almosaferBreakfast,null);
});
test('Correct decimal totals for variable nightly prices and multiple rooms',async()=>{
  const scraper=createLiveScraper(resolveAlmosaferDetails,async p=>parsePackages(poll([offer('RO',p.checkIn==='2026-10-01'?460.22:500.44,false,'غرفة ستاندرد',2)]),2,2));
  const [room]=await scraper({hotelInput:'كينجزجيت ديار',checkIn:'2026-10-01',checkOut:'2026-10-03',adults:2,rooms:2});
  assert.equal(room.roomOnlyTotalPrice,960.66);
  assert.equal(room.roomOnlyPricePerNight,240.17);
  assert.equal(room.breakfastPricePerNight,null);
  assert.equal(new URL(room.bookingUrl).searchParams.get('checkin'),'01-10-2026');assert.equal(new URL(room.bookingUrl).searchParams.get('rooms'),'2_adult*2_adult');
});
test('Odd package cents stay exact when split across multiple rooms',async()=>{
  const scraper=createLiveScraper(resolveAlmosaferDetails,async()=>parsePackages(poll([offer('RO',460.23,false,'غرفة ستاندرد',2)]),2,2));
  const [room]=await scraper({hotelInput:'كينجزجيت ديار',checkIn:'2026-10-01',checkOut:'2026-10-03',adults:2,rooms:2});
  assert.equal(room.roomOnlyTotalPrice,920.46);
});
test('Invalid dates, unresolved hotels and children without ages are rejected',async()=>{
  assert.throws(()=>datePairs('2026-02-30','2026-03-05'));
  assert.throws(()=>datePairs('2026-10-25','2026-10-25'));
  const scraper=createLiveScraper(resolveAlmosaferDetails,async()=>assert.fail('must not request'));
  await assert.rejects(scraper({hotelInput:'Unknown Hotel',checkIn:'2026-10-25',checkOut:'2026-10-26'}),/رابط الفندق/);
  await assert.rejects(scraper({hotelInput:'كينجزجيت',checkIn:'2026-10-25',checkOut:'2026-10-26',children:1}),/أعمار الأطفال/);
});
test('Marketing-identical room variants cannot share breakfast when bedding metadata is missing',()=>{
  const twin=offer('RO',793);
  twin.rooms[0]={...twin.rooms[0],originalRoomName:'Twin Room',templateId:11,rmsDetail:{matchingCode:'TWIN',locale:{ar:{bedding:''}}}};
  const breakfast=offer('BB',841.39);
  breakfast.rooms[0]={...breakfast.rooms[0],originalRoomName:'Double Room',templateId:12,rmsDetail:{matchingCode:'DOUBLE',locale:{ar:{bedding:''}}}};
  const parsed=Object.values(parsePackages(poll([twin,breakfast]),2,1));
  assert.equal(parsed.length,2);
  const exact=parsed.find(r=>r.originalNames[0]==='Twin Room');
  assert.equal(exact.offers.roomOnly.price,793);assert.equal(exact.offers.breakfast,undefined);
  assert.equal(parsed.find(r=>r.originalNames[0]==='Double Room').beddingVerified,false);
});
test('Unbookable offers and packages for a different room count cannot become a price',()=>{
  const soldOut={...offer('BB',1),bookable:false};
  const wrongCount=offer('RO',2,false,'غرفة ستاندرد',2);
  assert.deepEqual(parsePackages(poll([soldOut,wrongCount]),2,1),{});
});
test('A timeout on the first poll gets a fresh deadline on the next search',async()=>{
  let time=0,starts=0;
  const client=createEnigmaClient({token:'test',now:()=>time,sleep:async ms=>{time+=ms;},fetchImpl:async url=>{
    if(!url.includes('/poll/'))return response({pId:`p${++starts}`,hotelId:1287944,initialDelayInMillis:1});
    return response(starts===1?poll([offer('RO',1)],'IN_PROGRESS'):poll([offer('RO',714.4)]));
  }});
  assert.equal((await client(payload))['غرفة ستاندرد'].offers.roomOnly.price,714.4);assert.equal(starts,2);
});
test('Exact bed count/type are filtered, and unknown beds require an explicit choice',async()=>{
  const twin=offer('RO',500);twin.rooms[0].rmsDetail={locale:{ar:{bedding:'٢ سرير فردي'}}};
  const king=offer('RO',400);king.rooms[0].rmsDetail={locale:{ar:{bedding:'١ سرير كينج'}}};
  const unknown=offer('RO',300,false,'غرفة سوبيريور');
  const scraper=createLiveScraper(resolveAlmosaferDetails,async()=>parsePackages(poll([twin,king,unknown]),2,1));
  const params={hotelInput:'كينجزجيت',checkIn:'2026-10-25',checkOut:'2026-10-26',bedCount:2,bedType:'single'};
  const exact=await scraper(params);assert.equal(exact.length,1);assert.equal(exact[0].bedFilterStatus,'matched');assert.equal(exact[0].roomOnlyTotalPrice,500);
  const include=await scraper({...params,includeUnknownBeds:true});assert.equal(include.length,2);assert.equal(include.find(r=>r.roomName==='غرفة سوبيريور').bedFilterStatus,'unknown');
});
test('Supplier template changes do not create missing nights for the same explicitly described beds',async()=>{
  const scraper=createLiveScraper(resolveAlmosaferDetails,async p=>{
    const pkg=offer('RO',p.checkIn==='2026-10-01'?100:120);pkg.rooms[0]={...pkg.rooms[0],originalRoomName:p.checkIn==='2026-10-01'?'Twin Room':'Standard Twin Room',templateId:p.checkIn==='2026-10-01'?11:12,rmsDetail:{locale:{ar:{bedding:'٢ سرير فردي'}}}};
    return parsePackages(poll([pkg]),2,1);
  });
  const result=await scraper({hotelInput:'كينجزجيت',checkIn:'2026-10-01',checkOut:'2026-10-03',bedCount:2,bedType:'single'});
  assert.equal(result.length,1);assert.equal(result[0].roomOnlyTotalPrice,220);assert.equal(result[0].roomOnlyAvailableNights,2);
});
test('Fresh repair recovers empty and failed nights without copying another date',async()=>{
  const calls=new Map();
  const scraper=createLiveScraper(resolveAlmosaferDetails,async(p,options)=>{
    const n=(calls.get(p.checkIn)||0)+1;calls.set(p.checkIn,n);
    if(n===1&&p.checkIn==='2026-10-02')return {};
    if(n===1&&p.checkIn==='2026-10-03')throw new Error('temporary timeout');
    if(n>1)assert.equal(options.refresh,true);
    return parsePackages(poll([offer('RO',Number(p.checkIn.slice(-2))*100)]),2,1);
  });
  const [room]=await scraper({hotelInput:'كينجزجيت',checkIn:'2026-10-01',checkOut:'2026-10-04'});
  assert.deepEqual(room.dailyRates.map(d=>d.roomOnlyPrice),[100,200,300]);assert.deepEqual(room.warnings,[]);assert.equal(room.roomOnlyTotalPrice,600);
});
