// Live acceptance audit: production scrapers -> UI summary -> actual Excel exporter.
// No fixture, invented rate, cross-day fill, or multiplied single-room quote is used.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as XLSX from '../frontend/node_modules/xlsx/xlsx.mjs';
import {createEnigmaClient,roundMoney} from './scrapers/enigma.js';
import {createAlmatarClient} from './scrapers/almatar-client.js';
import {createAlmatarResolver,almatarBookingURL} from './scrapers/almatar.js';
import {resolveAlmosaferDetails} from './scrapers/almosafer.js';
import {createLiveScraper,datePairs} from './scrapers/almosafer-live.js';
import {executeHotelComparison} from './scrapers/index.js';
import {buildExportWorkbook} from '../frontend/src/services/excelExport.js';
import {summaryForRoom,rateFields} from '../frontend/src/services/rates.js';

const output=path.resolve('outputs/october-2026-live');
await fs.mkdir(output,{recursive:true});
const hotels=[
  {key:'almosafer-kingsgate',source:'almosafer',name:'كينجزجيت ديار',url:'https://www.almosafer.com/ar/hotel/details/atg/kingsgate-diar-hotel-1287944'},
  {key:'almosafer-naseem',source:'almosafer',name:'ميلينيوم مكة النسيم',url:'https://www.almosafer.com/ar/hotel/details/atg/ميلينيوم-مكة-النسيم-1798852'},
  {key:'almosafer-azizia',source:'almosafer',name:'مكة العزيزية',url:'https://www.almosafer.com/ar/hotel/details/atg/فندق-مكة-العزيزية-1371514'},
  {key:'almatar-dana',source:'almatar',name:'إم الدانة مكة',url:'https://almatar.com/ar/hotels/rooms/mecca-m-hotel-al-dana-makkah-millennium-1660326/'},
  {key:'almatar-naseem',source:'almatar',name:'ميلينيوم مكة النسيم',url:'https://almatar.com/ar/hotels/rooms/mecca-millennium-makkah-al-naseem-1766593/'},
  {key:'almatar-kiswah',source:'almatar',name:'أبراج الكسوة',url:'https://almatar.com/ar/hotels/rooms/mecca-al-kiswah-towers-hotel-1624041/'},
];
const occupancies=[{key:'1room-1adult',rooms:1,adults:1},{key:'1room-2adults',rooms:1,adults:2},{key:'2rooms-2adults-each',rooms:2,adults:2}];
const cases=hotels.flatMap(h=>occupancies.map(o=>({...h,...o,id:`${h.key}-${o.key}`})));
const report={startedAt:new Date().toISOString(),checkIn:'2026-10-01',checkOut:'2026-11-01',nights:31,caseCount:18,expectedHotelOccupancyDates:558,method:'Production scraper with recorded raw HTTP responses; package-id price reconciliation for every exported offer; actual website Excel exporter round trip.',cases:[]};
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({report,cases},null,2));
const token=process.env.ALMOSAFER_API_TOKEN || '4R!eVj7$&7Q8Duhv1#pB';
const fields=['roomOnly','breakfast','halfBoard','roomOnlyFlexible','breakfastFlexible','halfBoardFlexible'];

async function runCase(c) {
  const dir=path.join(output,c.id);await fs.mkdir(dir,{recursive:true});
  const packets=[],requests=[],checks=[],errors=[];
  let seq=0;
  const start=Date.now();console.log('START',c.id);
  const tracedFetch=async(url,options={})=>{
    const n=++seq,requestedAt=new Date().toISOString(),body=options.body?JSON.parse(options.body):null;
    let response;
    try {
      response=await fetch(url,options);
      const json=await response.clone().json();
      const file=`raw-${String(n).padStart(4,'0')}.json`;
      const packet={requestedAt,receivedAt:new Date().toISOString(),url,method:options.method || 'GET',request:body,httpStatus:response.status,response:json};
      await fs.writeFile(path.join(dir,file),JSON.stringify(packet));
      packets.push({...packet,file});requests.push({file,url,httpStatus:response.status,request:body,requestedAt});
    } catch(e) {requests.push({url,request:body,requestedAt,error:e.message});throw e;}
    return response;
  };
  const fetchDay=c.source==='almatar'?createAlmatarClient({fetchImpl:tracedFetch}):createEnigmaClient({token,fetchImpl:tracedFetch});
  const nights=[];
  const watchedDay=async(payload,options)=>{
    try {const value=await fetchDay(payload,options);nights.push({payload,completedAt:new Date().toISOString(),roomCount:Object.keys(value).length});console.log('DAY',c.id,payload.checkIn,Object.keys(value).length);return value;}
    catch(e){nights.push({payload,completedAt:new Date().toISOString(),error:e.message});console.log('DAY ERROR',c.id,payload.checkIn,e.message);throw e;}
  };
  const engine=createLiveScraper(c.source==='almatar'?createAlmatarResolver({fetchImpl:tracedFetch}):resolveAlmosaferDetails,watchedDay,c.source==='almatar'?{source:'Almatar',sourceArabic:'المطار',bookingURL:almatarBookingURL}:{});
  const params={hotelInput:c.url,checkIn:report.checkIn,checkOut:report.checkOut,adults:c.adults,rooms:c.rooms,children:0,childAges:[],bedCount:0,bedType:'any',sources:[c.source],refresh:true};
  let result;
  try {
    if(process.argv.includes('--reconcile-only') || (process.argv.includes('--resume') && await fs.access(path.join(dir,'audit.json')).then(()=>true,()=>false))) {
      const saved=JSON.parse(await fs.readFile(path.join(dir,'audit.json'),'utf8'));
      requests.push(...saved.requests);nights.push(...saved.nights);
      for(const req of saved.requests)if(req.file)packets.push({...JSON.parse(await fs.readFile(path.join(dir,req.file),'utf8')),file:req.file});
      result=JSON.parse(await fs.readFile(path.join(dir,'result.json'),'utf8')).result;
    } else result=await executeHotelComparison(params,{[c.source]:engine});
    await fs.writeFile(path.join(dir,'result.json'),JSON.stringify({params,result},null,2));
    if(!result.data.length){errors.push('No room offers returned; no workbook fabricated.');}
    const pairs=datePairs(params.checkIn,params.checkOut);
    for(const room of result.data) {
      assert.equal(room.dailyRates.length,31);assert.equal(room.rooms,c.rooms);assert.equal(room.adults,c.adults);assert.equal(room.dataKind,'live');
      assert.deepEqual(room.dailyRates.map(d=>d.date),pairs.map(d=>d.date));
      for(const day of room.dailyRates)for(const [field,offer] of Object.entries(day.offers)) {
        const payload=nights.find(n=>n.payload.checkIn===day.date)?.payload;
        const related=packets.filter(p=>c.source==='almatar'?p.request?.req&&(typeof p.request.req.fd==='string')&&p.request.req.fd===`${day.date.slice(5,7)}/${day.date.slice(8)}/${day.date.slice(0,4)}`:p.response.pollingStatus==='COMPLETED_SUCCESSFULLY'&&p.url.includes('/poll/')&&packets.some(init=>init.request?.checkIn===day.date&&String(init.response.pId)&&p.url.endsWith(encodeURIComponent(init.response.pId))));
        const found=[];
        for(const p of related) {
          const groups=c.source==='almatar'?p.response.data?.searchRoomsResults:p.response.packagesGroups;
          for(const g of groups || [])for(const raw of (c.source==='almatar'?[g.defaultPackage,...(g.packages || [])].filter(Boolean):g.packages || []))if(String(raw.packageId || raw.id)===String(offer.packageId))found.push({raw,packet:p});
        }
        const matching=found.find(({raw})=>Math.abs((c.source==='almatar'?Math.ceil(Number(raw.finalPrice)):Number(raw.packageRateInfo?.total))-offer.price*c.rooms)<0.000001);
        assert.ok(matching,`Raw package missing or wrong price: ${c.id} ${day.date} ${offer.packageId}`);
        const {raw,packet}=matching;
        assert.equal(raw.rooms.length,c.rooms);
        if(c.source==='almatar') {assert.ok(raw.rooms.every(r=>r.adultsCount===c.adults));assert.equal(String(raw.almtaarHotelId),payload.hotelId);assert.equal(raw.currency,'SAR');assert.equal(raw.rooms[0].roomBasis,offer.mealLabel);}
        else {assert.equal(raw.bookable,true);assert.ok(raw.rooms.every(r=>r.numberOfAdults===c.adults));assert.equal(packet.response.pollingStatus,'COMPLETED_SUCCESSFULLY');assert.equal(String(packet.response.hotelId),payload.hotelId);assert.equal(packet.response.numberOfNights,1);assert.equal(({roomOnly:'RO',breakfast:'BB',halfBoard:'HB'})[field.replace('Flexible','')],raw.rooms[0].roomBasis);}
        checks.push({roomId:room.id,date:day.date,field,packageId:offer.packageId,sourceAmount:c.source==='almatar'?raw.finalPrice:raw.packageRateInfo.total,packageTotal:offer.totalPrice,perRoom:offer.price,rawFile:packet.file,status:'matched'});
      }
      for(const field of fields) {
        const values=room.dailyRates.map(d=>d[`${field}Price`]);
        const expected=values.every(v=>v!==null)?roundMoney(values.reduce((s,v)=>s+v,0)*c.rooms):null;
        assert.equal(room[`${field}TotalPrice`],expected);
      }
    }
    if(result.data.length) {
      // Export exactly the same workbook the website exports for its initial selected room.
      const selected=summaryForRoom(result.summary,result.data[0]);
      const book=buildExportWorkbook(params,result.data,selected,'all','both');
      const filename=`${c.id}.xlsx`;const bytes=XLSX.write(book,{type:'buffer',bookType:'xlsx'});
      await fs.writeFile(path.join(output,filename),bytes);
      const reopened=XLSX.read(bytes,{type:'buffer'}),rows=XLSX.utils.sheet_to_json(reopened.Sheets[reopened.SheetNames[0]],{header:1});
      const columns=rateFields(selected,'both');
      for(const d of selected.dailyBreakdown) {
        const row=rows.slice(rows.findIndex(r=>r[0]==='اليوم')+1).find(r=>r[1]===d.date);assert.ok(row);
        columns.forEach(([field],i)=>assert.equal(row[2+i],d.almosaferAvailability==='error'?'تعذر التحقق':(d[`almosafer${field[0].toUpperCase()+field.slice(1)}`] ?? 'غير متاح')));
      }
      for(const room of result.data) {
        // Same production exporter, round-trip verified for EVERY selectable room, kept in case folder.
        const summary=summaryForRoom(result.summary,room),wb=buildExportWorkbook(params,result.data,summary,'all','both');
        const data=XLSX.write(wb,{type:'buffer',bookType:'xlsx'}),parsed=XLSX.read(data,{type:'buffer'}),all=XLSX.utils.sheet_to_json(parsed.Sheets[parsed.SheetNames[0]],{header:1});
        for(const d of summary.dailyBreakdown) {const row=all.slice(all.findIndex(r=>r[0]==='اليوم')+1).find(r=>r[1]===d.date);assert.ok(row);rateFields(summary).forEach(([f],i)=>assert.equal(row[2+i],d.almosaferAvailability==='error'?'تعذر التحقق':d[`almosafer${f[0].toUpperCase()+f.slice(1)}`] ?? 'غير متاح'));}
        await fs.writeFile(path.join(dir,`${room.id}.xlsx`),data);
      }
    }
  }catch(e){errors.push(e.stack || e.message);console.log('CASE ERROR',c.id,e.message);}
  const latest=Object.fromEntries(nights.map(n=>[n.payload.checkIn,n]));
  const entry={id:c.id,source:c.source,hotel:c.name,url:c.url,adultsPerRoom:c.adults,rooms:c.rooms,totalAdults:c.adults*c.rooms,seconds:Math.round((Date.now()-start)/1000),queriedFrom:requests.map(r=>r.requestedAt).sort()[0],queriedTo:nights.map(n=>n.completedAt).sort().at(-1),roomVariants:result?.data?.length || 0,datesAttempted:Object.keys(latest).length,availableDates:Object.values(latest).filter(d=>d.roomCount>0).length,unavailableDates:Object.values(latest).filter(d=>d.roomCount===0).length,errorDates:Object.values(latest).filter(d=>d.error).length,rawResponses:packets.length,rawOfferMatches:checks.length,exportedRoomWorkbooks:errors.length?0:result?.data?.length || 0,errors,warnings:result?.warnings || [],status:errors.length?'needs-review':Object.values(latest).some(d=>d.error)?'partial':'verified'};
  await fs.writeFile(path.join(dir,'audit.json'),JSON.stringify({entry,requests,nights,checks},null,2));
  report.cases.push(entry);await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log('DONE',JSON.stringify(entry));
}
let index=0;
await Promise.all(Array.from({length:2},async()=>{while(index<cases.length)await runCase(cases[index++]);}));
report.finishedAt=new Date().toISOString();report.availableDates=report.cases.reduce((s,c)=>s+c.availableDates,0);report.unavailableDates=report.cases.reduce((s,c)=>s+c.unavailableDates,0);report.errorDates=report.cases.reduce((s,c)=>s+c.errorDates,0);report.rawOfferMatches=report.cases.reduce((s,c)=>s+c.rawOfferMatches,0);
await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
console.log('FINISHED',report.cases.length,'cases','available',report.availableDates,'unavailable',report.unavailableDates,'errors',report.errorDates,'raw matches',report.rawOfferMatches);
