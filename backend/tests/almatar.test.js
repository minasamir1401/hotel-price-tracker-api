import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAlmatarClient,parseAlmatarPackages,toAlmatarPayload} from '../scrapers/almatar-client.js';
import {createAlmatarResolver,resolveAlmatarDetails} from '../scrapers/almatar.js';
import {createLiveScraper} from '../scrapers/almosafer-live.js';
import {executeHotelComparison} from '../scrapers/index.js';
const input='https://almatar.com/ar/hotels/rooms/mecca-m-hotel-al-dana-makkah-millennium-1660326/';
const payload={hotelId:'1660326',hotelProfileKey:'mecca-m-hotel-al-dana-makkah-millennium-1660326',checkIn:'2026-10-01',checkOut:'2026-10-02',roomsInfo:[{adultsCount:2,kidsAges:[]}],currency:'SAR'};
const fixture=JSON.parse(await readFile(new URL('./fixtures/almatar-day.json',import.meta.url),'utf8'));
const response=data=>({ok:true,json:async()=>data});

test('Almatar includes default room-only offers, keeps King/Twin distinct and matches the website rounded price and names',()=>{
  const rooms=Object.values(parseAlmatarPackages([fixture],toAlmatarPayload(payload)));
  const king=rooms.find(r=>r.name==='غرفة ستاندرد'&&r.beddingLabel==='KING Bed');
  const twin=rooms.find(r=>r.name==='غرفة ستاندرد توأم');
  assert.equal(king.offers.roomOnly.price,113);assert.equal(king.offers.breakfast.price,180);assert.equal(king.offers.halfBoard.price,352);
  assert.equal(king.offers.breakfast.mealLabel,'إقامة وإفطار');assert.equal(king.offers.halfBoard.mealLabel,'إفطار + غداء أو عشاء');
  assert.deepEqual(king.beds[0].options,[{count:1,type:'king'}]);assert.deepEqual(twin.beds[0].options,[{count:2,type:'single'}]);
  assert.equal(king.offers.roomOnlyFlexible,undefined);
  const wrong=structuredClone(fixture);wrong.data.searchRoomsResults.forEach(g=>{g.defaultPackage.almtaarHotelId=123;g.packages=[];});
  assert.deepEqual(parseAlmatarPackages([wrong],toAlmatarPayload(payload)),{});
});
test('Almatar waits for complete extra results and uses the latest package price rather than a partial price',async()=>{
  const initial=structuredClone(fixture),final=structuredClone(fixture);
  initial.data.isSearchCompleted=false;initial.data.searchRoomsResults[0].defaultPackage.finalPrice=1;
  const urls=[];const client=createAlmatarClient({sleep:async()=>{},fetchImpl:async(url)=>{urls.push(url);return response(url.includes('search_with_session_id')?final:initial);}});
  const result=Object.values(await client(payload));
  assert.equal(result.find(r=>r.name==='غرفة ستاندرد').offers.roomOnly.price,113);
  assert.equal(urls.length,2);assert.ok(urls[1].includes('/v4/'));assert.ok(urls[0].startsWith('https://almatar.com/'));
});
test('Free cancellation maps isRefundable status directly from the API without strict timestamp expiry',()=>{
  const packet=structuredClone(fixture),pkg=packet.data.searchRoomsResults[0].defaultPackage;
  pkg.isRefundable=true;pkg.refundableUntil=1791417540;
  const parse=now=>Object.values(parseAlmatarPackages([packet],toAlmatarPayload(payload),now)).find(r=>r.name==='غرفة ستاندرد');
  assert.equal(parse(1790812800000).offers.roomOnlyFlexible.price,113);
  assert.equal(parse(1791417540001).offers.roomOnlyFlexible.price,113);
});
test('Wrong returned dates are rejected and never cached; request occupancy includes all rooms and exact child ages',async()=>{
  const req=toAlmatarPayload({...payload,roomsInfo:[{adultsCount:2,kidsAges:[5]},{adultsCount:2,kidsAges:[5]}]});
  assert.equal(req.multiRoomMode,false);assert.equal(req.req.fd,'10/01/2026');assert.deepEqual(req.req.rs,[{ac:2,cc:1,ka:[5]},{ac:2,cc:1,ka:[5]}]);
  let wrong=true,calls=0;const client=createAlmatarClient({sleep:async()=>{},fetchImpl:async()=>{calls++;const data=structuredClone(fixture);if(wrong)data.data.req.td+=86400;return response(data);}});
  await assert.rejects(client(payload),/تواريخ مختلفة/);wrong=false;
  assert.ok(Object.keys(await client(payload)).length);assert.equal(calls,3);
});
test('An uncompleted Almatar response stays an error and a fresh attempt has its own deadline',async()=>{
  let time=0,starts=0;
  const client=createAlmatarClient({now:()=>time,sleep:async ms=>{time+=ms;},fetchImpl:async url=>{if(url.includes('/v5/'))starts++;const data=structuredClone(fixture);data.data.isSearchCompleted=starts>1;return response(data);}});
  assert.equal(Object.values(await client(payload)).find(r=>r.name==='غرفة ستاندرد').offers.roomOnly.price,113);assert.equal(starts,2);assert.ok(time>=45000);
});
test('Hotel identity is verified through the official response, and a wrong hotel cannot be relabelled from the URL',async()=>{
  assert.equal(resolveAlmatarDetails(input).hotelId,'1660326');
  assert.throws(()=>resolveAlmatarDetails('https://almosafer.com/ar/hotels/rooms/hotel-1660326/'));
  const resolver=createAlmatarResolver({fetchImpl:async()=>response({data:{almHotelCode:1660326,almHotelProfileKey:payload.hotelProfileKey,hotelBasicData:{name:'فندق إم الدانة مكة من ميلينيوم',countryCode:'SA'}}})});
  assert.equal((await resolver(input)).hotelName,'فندق إم الدانة مكة من ميلينيوم');
  const bad=createAlmatarResolver({fetchImpl:async()=>response({data:{almHotelCode:999}})});await assert.rejects(bad(input),/لا يطابق/);
});
test('A real Almatar result is retained if another provider fails, with source meal titles and bed filtering',async()=>{
  const scraper=createLiveScraper(async()=>({...resolveAlmatarDetails(input),hotelName:'فندق إم الدانة مكة من ميلينيوم'}),async()=>parseAlmatarPackages([fixture],toAlmatarPayload(payload)),{source:'Almatar',sourceArabic:'المطار'});
  const params={hotelInput:input,checkIn:'2026-10-01',checkOut:'2026-10-02',adults:2,rooms:1,bedCount:2,bedType:'single',sources:['almosafer','almatar']};
  const result=await executeHotelComparison(params,{almosafer:async()=>{throw new Error('provider unavailable');},almatar:scraper});
  assert.equal(result.success,true);assert.equal(result.summary.sourceArabic,'المطار');assert.equal(result.summary.mealPlanLabels.breakfast,'إقامة وإفطار');
  assert.ok(result.data.every(r=>r.bedFilterStatus==='matched'));assert.ok(result.warnings[0].includes('provider unavailable'));
});
