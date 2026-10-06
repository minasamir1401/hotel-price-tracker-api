import fs from 'node:fs/promises';
import { almatarHeaders } from './scrapers/almatar-client.js';
const body = {hotelId:'133550',hotelProfileKey:'mecca-al-marwa-rayhaan-by-rotana-makkah-133550',countryCode:'SA',multiRoomMode:false,req:{cy:'SAR',fd:'10/06/2026',td:'10/07/2026',rs:[{ac:2,cc:0,ka:[]}]}};
const response = await fetch('https://almatar.com/api/hotel/v5/rooms/getpackages/search_with_hotel',{method:'POST',headers:almatarHeaders,body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
const packet = await response.json();
await fs.writeFile('outputs/almarwa-2026-10-06/mode-false.json', JSON.stringify({request:body,response:packet}, null, 2));
console.log(JSON.stringify({complete:packet.data?.isSearchCompleted,groups:packet.data?.searchRoomsResults?.filter(g=>[g.defaultPackage,...(g.packages||[])].some(p=>p?.rooms?.[0]?.roomName==='غرفة واسعة بسرير توأم')).map(g=>({default:g.defaultPackage?.packageId,offers:[g.defaultPackage,...(g.packages||[])].filter(Boolean).map(p=>({id:p.packageId,name:p.rooms[0]?.roomName,meal:p.rooms[0]?.roomBasis,price:p.finalPrice,refundable:p.isRefundable}))}))},null,2));
