import { readBedOptions } from './beds.js';

export const almatarHeaders = {
  'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept:'application/json',
  'Content-Type':'application/json',
  'Accept-Language':'ar',
  platform:'web',
  'x-flow':'b2c',
  Origin:'https://almatar.com',
  Referer:'https://almatar.com/',
  'Cache-Control':'no-cache',
};
export function planFor(label) {
  if (!label) return null;
  const s = String(label).trim().toLowerCase();
  if (/إفطار.*\+|غداء|عشاء|نصف إقامة|وجبتين|half\s*board|\bhb\b/.test(s)) return 'halfBoard';
  if (/كاملة|ثلاث وجبات|full\s*board|\bfb\b|all\s*inclusive/.test(s)) return 'halfBoard';
  if (/إفطار|فطور|breakfast|bed\s*(and|&)\s*breakfast|\bbb\b/.test(s)) return 'breakfast';
  if (/إقامة فقط|غرفة فقط|بدون وجبات|بدون إفطار|room\s*only|bed\s*only|\bro\b/.test(s)) return 'roomOnly';
  return null;
}
export function almatarBeds(room) {
  const bed=readBedOptions({bedding:room.bedType || ''});
  const named={'TWIN BED':{count:2,type:'single'},'KING BED':{count:1,type:'king'},'QUEEN BED':{count:1,type:'queen'},'DOUBLE BED':{count:1,type:'double'},'SINGLE BED':{count:1,type:'single'}}[String(room.bedType || '').trim().toUpperCase()];
  if(named)bed.options=[named];
  return bed;
}
export function parseAlmatarPackages(packets,payload,now=Date.now()) {
  const result={};
  for(let pIdx = 0; pIdx < packets.length; pIdx++) {
    const packet = packets[pIdx];
    const isPrimaryPacket = (pIdx === 0);
    const isCompleted = packet.data?.isSearchCompleted !== false;
    for(const group of packet.data?.searchRoomsResults || []) {
      for(const pkg of [group.defaultPackage,...(group.packages || [])].filter(Boolean)) {
        if(!pkg.packageId||String(pkg.almtaarHotelId)!==String(payload.hotelId))continue;
        const rooms=pkg.rooms || [];
        if(rooms.length!==payload.req.rs.length||rooms.some((r,i)=>Number(r.adultsCount)!==Number(payload.req.rs[i].ac)||JSON.stringify((r.kidsAges || []).map(Number))!==JSON.stringify(payload.req.rs[i].ka || [])))continue;
        const label=rooms[0]?.roomBasis,plan=planFor(label);
        if(!plan||rooms.some(r=>r.roomBasis!==label))continue;
        if(pkg.currency!=='SAR'||rooms.some(r=>r.currency&&r.currency!=='SAR'))throw new Error('المطار رجع عملة مختلفة عن الريال السعودي');

        const rawFinal = Number(pkg.finalPrice || pkg.originalFinalPrice);
        const rawOriginal = Number(pkg.originalFinalPrice || pkg.finalPrice);
        if(!Number.isFinite(rawFinal)||rawFinal<=0||pkg.bookable===false)continue;

        const numRooms = rooms.length || 1;
        const displayTotal = Math.ceil(rawFinal);
        const displayPrice = Math.ceil(rawFinal / numRooms);
        const originalTotal = Math.ceil(rawOriginal);
        const originalPrice = Math.ceil(rawOriginal / numRooms);

        const beds=rooms.map(almatarBeds),names=rooms.map(r=>r.roomName || '');
        if(names.some(n=>!n))continue;
        const name=names.join(' / ');
        const identity=JSON.stringify(rooms.map((r,i)=>({name:r.roomName,beds:beds[i].options,bedLabel:beds[i].label,view:r.roomView || '',size:r.roomSize || ''})));
        const key=`${name}::${identity}`;
        if(!result[key])result[key]={name,category:names[0],beds,beddingLabel:beds.map(b=>b.label || 'لم يحدد المصدر').join(' / '),beddingVerified:beds.every(b=>b.options.length),originalNames:names,offers:{}};

        const until=pkg.refundableUntil;
        const numeric=typeof until==='number'||/^\d{10,13}$/.test(String(until || ''));
        const expiry=numeric?Number(until)*(Number(until)<1e11?1000:1):Date.parse(until);
        const flexible = pkg.refundability === 'قابل للإسترداد' || pkg.isRefundable === true || (Number.isFinite(expiry) && expiry > now);
        const targetField = flexible ? `${plan}Flexible` : plan;

        const existing = result[key].offers[targetField];
        const shouldSet = !existing ||
          (!existing.isCompleted && isCompleted) ||
          (existing.isCompleted && isCompleted && (existing.packetIndex === undefined || existing.packetIndex <= pIdx));
        if(shouldSet){
          result[key].offers[targetField]={
            price: displayPrice,
            totalPrice: displayTotal,
            sourceTotalPrice: rawFinal,
            originalPrice: originalPrice,
            originalTotalPrice: originalTotal,
            sourceOriginalPrice: rawOriginal,
            sourceRounding:'round-package-total',
            packageId:pkg.packageId,
            mealLabel:label,
            cancellationPolicy:pkg.refundability||(flexible?'قابل للإسترداد':'غير قابل للإسترداد'),
            refundableUntil:pkg.refundableUntil||null,
            appliedCouponCode:pkg.appliedCouponCode||null,
            roomIdentity:key,
            isPrimary: isPrimaryPacket,
            isCompleted: isCompleted,
            packetIndex: pIdx,
          };
        }
      }
    }
  }
  return result;
}
export function toAlmatarPayload(payload) {
  const mdy=iso=>{const [y,m,d]=iso.split('-');return `${m}/${d}/${y}`;};
  return {hotelId:String(payload.hotelId),hotelProfileKey:payload.hotelProfileKey,countryCode:payload.countryCode || '',multiRoomMode:payload.roomsInfo.length===1,req:{cy:'SAR',fd:mdy(payload.checkIn),td:mdy(payload.checkOut),rs:payload.roomsInfo.map(r=>({ac:r.adultsCount,cc:r.kidsAges.length,ka:r.kidsAges}))}};
}
export function createAlmatarClient({fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now,cacheTTL=120000}={}) {
  const cache=new Map(),pending=new Map();
  async function post(path,body,deadline) {
    const remaining=deadline-now();if(remaining<=0)throw new Error('انتهت مهلة استعلام المطار لهذه الليلة');
    const res=await fetchImpl(`https://almatar.com/${path}`,{method:'POST',headers:almatarHeaders,body:JSON.stringify(body),signal:AbortSignal.timeout(Math.min(30000,remaining))});
    if(!res.ok)throw new Error(`المطار HTTP ${res.status}`);
    const json=await res.json();if(!json.data||!Array.isArray(json.data.searchRoomsResults))throw new Error(json.errors?.[0]?.message || 'المطار لم يرجع نتيجة غرف صالحة');
    return json;
  }
  function verify(packet,payload) {
    const req=packet.data?.req;
    if(!req || !req.cy) return;
    if(req.cy!=='SAR')throw new Error('بيانات طلب المطار غير مؤكدة');
    const iso=date=>typeof date==='number'?new Date(date*1000).toISOString().slice(0,10):new Date(date).toISOString().slice(0,10);
    if(iso(req.fd)!==payload.checkIn||iso(req.td)!==payload.checkOut)throw new Error('المطار رجع أسعار تواريخ مختلفة');
    const expected=payload.roomsInfo.map(r=>({ac:Number(r.adultsCount),cc:r.kidsAges.length,ka:r.kidsAges}));
    const actual=req.rs?.map(r=>({ac:Number(r.ac),cc:Number(r.cc),ka:(r.ka || []).map(Number)}));
    if(JSON.stringify(expected)!==JSON.stringify(actual))throw new Error('المطار رجع إشغال غرف مختلف');
  }
  async function query(payload,deadline) {
    const request=toAlmatarPayload(payload),packets=[];
    let packet=await post('api/hotel/v5/rooms/getpackages/search_with_hotel',request,deadline);
    verify(packet,payload);
    packets.push(packet);

    if(payload.fastRoomsOnly && packets.some(p=>p.data?.searchRoomsResults?.length)) {
      return parseAlmatarPackages(packets,request,now());
    }

    if(packet.data?.searchRoomsResults?.length && packet.data?.isSearchCompleted === true) {
      return parseAlmatarPackages(packets,request,now());
    }

    for(let attempt=0;deadline-now()>0 && attempt<60;attempt++) {
      if(attempt > 0) {
        verify(packet,payload);
        packets.push(packet);
      }
      const isCompleted = packet.data?.isSearchCompleted === true;

      if(attempt>=1 && isCompleted) {
        return parseAlmatarPackages(packets,request,now());
      }
      if(packet.data?.hotelIsAvailable===false && !packets.some(p=>p.data?.searchRoomsResults?.length)) {
        return {};
      }
      const sessionId = packet.data?.sd || packets.find(p=>p.data?.sd)?.data?.sd;
      if(!sessionId) {
        if(packet.data?.isSearchCompleted === false) {
          const waitTime = Math.max(1000, deadline - now());
          await sleep(waitTime);
          throw new Error('بحث المطار لم يكتمل وانتهت مهلة الاستعلام');
        }
        break;
      }
      const sleepTime = Math.min(2000,Math.max(800,Number(packet.data?.executionTime)||1000));
      await sleep(sleepTime);
      if(deadline - now() <= 0) break;
      packet=await post('api/hotel/v4/rooms/getpackages/search_with_session_id',{almHotelId:Number(payload.hotelId),queueSessionId:sessionId,hotelProfileKey:payload.hotelProfileKey,req:request.req},deadline);
    }

    if(!packets.some(p=>p.data?.isSearchCompleted === true)) {
      throw new Error('بحث المطار لم يكتمل');
    }

    return parseAlmatarPackages(packets,request,now());
  }
  return async(payload,{refresh=false,maxAttempts=2}={})=>{
    const key=JSON.stringify(payload),cached=cache.get(key);
    if(!refresh&&cached?.expires>now())return cached.value;
    if(pending.has(key))return pending.get(key);
    const task=(async()=>{for(let attempt=0;attempt<maxAttempts;attempt++) {try{const value=await query(payload,now()+45000);return value;}catch(error){if(attempt===maxAttempts-1)throw error;}await sleep(500);}})().then(value=>{for(const [k,c] of cache)if(c.expires<=now())cache.delete(k);if(cache.size>=1000)cache.delete(cache.keys().next().value);cache.set(key,{value,expires:now()+(Object.keys(value).length?cacheTTL:20000)});return value;}).finally(()=>pending.delete(key));
    pending.set(key,task);return task;
  };
}
