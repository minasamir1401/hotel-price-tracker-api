import fs from 'node:fs/promises';
import {executeHotelComparison} from './scrapers/index.js';
const params={hotelInput:'فندق كينجزجيت ديار',checkIn:'2026-10-01',checkOut:'2026-11-01',adults:2,children:0,rooms:1,sources:['almosafer'],refresh:true};
const start=Date.now();
const result=await executeHotelComparison(params);
await fs.writeFile(new URL('./verification/month-live.json',import.meta.url),JSON.stringify({params,result},null,2));
console.log('LIVE',result.success,'rooms',result.data.length,'nights',result.summary?.dailyBreakdown.length,'seconds',(Date.now()-start)/1000);
for(const day of result.summary?.dailyBreakdown || []) console.log(day.date,'RO',day.almosaferRoomOnly,'BB',day.almosaferBreakfast,'flexRO',day.almosaferRoomOnlyFlexible,'state',day.almosaferAvailability);
console.log('warnings',result.warnings);
