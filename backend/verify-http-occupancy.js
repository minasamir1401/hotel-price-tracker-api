import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const sources=[
  {source:'almosafer',url:'https://www.almosafer.com/ar/hotel/details/atg/ميلينيوم-مكة-النسيم-1798852'},
  {source:'almatar',url:'https://almatar.com/ar/hotels/rooms/mecca-m-hotel-al-dana-makkah-millennium-1660326/'},
];
const cases=sources.flatMap(s=>[{rooms:1,adults:1},{rooms:1,adults:2},{rooms:2,adults:2}].map(o=>({...s,...o})));
const results=[];let i=0;
await Promise.all(Array.from({length:2},async()=>{while(i<cases.length){
  const c=cases[i++],params={hotelInput:c.url,sources:[c.source],checkIn:'2026-10-31',checkOut:'2026-11-01',adults:c.adults,rooms:c.rooms,children:0,refresh:true};
  try {
    const http=await fetch('http://127.0.0.1:5173/api/search-hotel-prices',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(params),signal:AbortSignal.timeout(180000)});
    const result=await http.json();assert.equal(http.status,200);assert.equal(result.success,true);assert.ok(result.data.length);
    for(const room of result.data){assert.equal(room.rooms,c.rooms);assert.equal(room.adults,c.adults);assert.equal(room.nights,1);assert.equal(room.dailyRates[0].date,'2026-10-31');assert.equal(room.dataKind,'live');assert.ok(new URL(room.bookingUrl).searchParams.get('rooms').split(/[,\*]/).every(r=>r===`${c.adults}_adult`));}
    results.push({params,result,status:'passed'});console.log('HTTP PASS',c.source,c.rooms,'rooms',c.adults,'adults',result.data.length,'variants');
  }catch(e){results.push({params,status:'failed',error:e.message});console.log('HTTP FAIL',c.source,e.message);}
}}));
await fs.writeFile('outputs/october-2026-live/http-occupancy-tests.json',JSON.stringify({testedAt:new Date().toISOString(),results},null,2));
if(results.some(r=>r.status==='failed'))process.exitCode=1;
