import {createAlmatarClient,almatarHeaders} from './almatar-client.js';
import {createLiveScraper} from './almosafer-live.js';

export function resolveAlmatarDetails(hotelInput) {
  let url;
  try { url = new URL(hotelInput); } catch {}
  if (!url || !['almatar.com', 'www.almatar.com'].includes(url.hostname)) {
    throw new Error('يرجى إدخال رابط الفندق من المطار لتحديد الفندق بدقة');
  }
  const decodedPath = decodeURIComponent(url.pathname);
  const profile = decodedPath.match(/\/hotels\/rooms\/([^/]+)\/?$/)?.[1];
  const hotelId = profile?.match(/-(\d+)$/)?.[1] || url.searchParams.get('hotelId') || url.searchParams.get('id');
  if (!profile || !hotelId) {
    throw new Error('رابط المطار لا يحتوي معرّف الفندق؛ استخدم رابط صفحة الغرف');
  }
  const cleanName = profile.replace(/-\d+$/, '').replace(/-/g, ' ').trim();
  return {
    hotelId: String(hotelId),
    hotelProfileKey: profile,
    hotelName: cleanName,
    hotelNameEn: cleanName,
    baseSlug: `hotels/rooms/${profile}/`,
  };
}

export function createAlmatarResolver({ fetchImpl = fetch, now = Date.now } = {}) {
  const cache = new Map();
  return async (hotelInput) => {
    const details = resolveAlmatarDetails(hotelInput);
    const cached = cache.get(details.hotelProfileKey);
    if (cached?.expires > now()) return cached.value;
    try {
      const r = await fetchImpl(`https://almatar.com/api/almtaar/hotelbyprofilekey/${encodeURIComponent(details.hotelProfileKey)}`, {
        headers: almatarHeaders,
        signal: AbortSignal.timeout(20000),
      });
      if (r.ok) {
        const body = await r.json();
        const hotel = body?.data;
        if (hotel?.almHotelCode && String(hotel.almHotelCode) !== String(details.hotelId)) {
          throw new Error('معرف الفندق المسترجع لا يطابق الرابط المدخل');
        }
        const apiName = hotel?.hotelBasicData?.name || hotel?.hotelBasicData?.arName || details.hotelName;
        const value = {
          ...details,
          hotelName: apiName,
          hotelNameEn: hotel?.hotelBasicData?.name || details.hotelNameEn,
          countryCode: hotel?.hotelBasicData?.countryCode || 'SA',
        };
        cache.set(details.hotelProfileKey, { value, expires: now() + 3600000 });
        return value;
      }
    } catch (err) {
      if (err.message && err.message.includes('لا يطابق')) throw err;
    }
    cache.set(details.hotelProfileKey, { value: details, expires: now() + 3600000 });
    return details;
  };
}
export function almatarBookingURL(details,{checkIn,checkOut,adults,rooms,childAges}) {
  const url=new URL(`https://almatar.com/ar/${details.baseSlug}`);
  const mdy=iso=>{const[y,m,d]=iso.split('-');return `${m}/${d}/${y}`;};
  url.searchParams.set('checkIn',mdy(checkIn));url.searchParams.set('checkOut',mdy(checkOut));
  const occupancy=`${adults}_adult${childAges.length?`:${childAges.length}_child:${childAges.join('-')}_age`:''}`;
  url.searchParams.set('rooms',Array.from({length:rooms},()=>occupancy).join(','));return url.href;
}
export const scrapeAlmatar=createLiveScraper(createAlmatarResolver(),createAlmatarClient(),{source:'Almatar',sourceArabic:'المطار',bookingURL:almatarBookingURL});
