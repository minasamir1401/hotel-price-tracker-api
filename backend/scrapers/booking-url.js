import { bookingHotelId } from './booking-client.js';

function propertyUrl(input) {
  try {
    const url = new URL(input);
    if (!['https:', 'http:'].includes(url.protocol) || !(url.hostname === 'booking.com' || url.hostname.endsWith('.booking.com')) || !/^\/hotel\/[a-z]{2}\/[^/]+\.html$/i.test(url.pathname)) throw new Error();
    return url;
  } catch { throw new Error('Booking: أدخل رابط صفحة فندق صالح من Booking'); }
}

function linkedRoomIds(url) {
  const values = ['matching_block_id', 'highlighted_blocks', 'all_sr_blocks', 'sr_pri_blocks'].flatMap(key => url.searchParams.getAll(key));
  return [...new Set(values.flatMap(value => value.split(',')).map(value => value.match(/^([1-9]\d+)_\d+_\d+_\d+_\d+(?:__\d+)?$/)?.[1]).filter(Boolean))];
}

// IDs in shared links are hints. The app must confirm room membership before
// accepting a candidate hotel; no prices or availability are inferred from a URL.
export async function resolveBookingUrl(input, request, client, { fetchImpl = fetch } = {}) {
  let explicitId;
  try { explicitId = bookingHotelId(input); } catch { /* property links can contain room IDs */ }
  if (explicitId) return client.hotelDetails({ ...request, hotelId: explicitId });
  const url = propertyUrl(input), roomIds = linkedRoomIds(url);
  if (roomIds.length) {
    const candidates = [...new Set(roomIds.map(id => id.slice(0, -2)).filter(id => /^[1-9]\d*$/.test(id)))];
    if (candidates.length === 1) {
      const hotelId = candidates[0];
      const [details, rates] = await Promise.all([client.hotelDetails({ ...request, hotelId }), client.rooms({ ...request, hotelId })]);
      const returnedIds = new Set(Object.values(rates).flatMap(room => Object.values(room.offers || {}).map(offer => String(offer.roomId))));
      if (roomIds.every(id => returnedIds.has(id))) return { ...details, bookingUrl: url.origin + url.pathname, identityMethod: 'app-verified-linked-rooms' };
      throw new Error('Booking: لم يؤكد التطبيق أن الغرف الموجودة في الرابط تخص هذا الفندق؛ انسخ رابط الفندق الحالي من Booking');
    }
  }
  // Resolve plain links from public identity metadata. Prices use the app API.
  const canonical = new URL(url.pathname, 'https://www.booking.com');
  let response;
  try { response = await fetchImpl(canonical.href, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' }, redirect: 'error', signal: AbortSignal.timeout(20000) }); }
  catch { throw new Error('Booking: تعذر تحديد الفندق من الرابط؛ انسخ الرابط الكامل الذي يحتوي بيانات الغرف'); }
  if (response.status !== 200) throw new Error('Booking: المصدر لم يسمح باستخراج معرّف الفندق من هذا الرابط؛ انسخ الرابط الكامل الذي يحتوي بيانات الغرف');
  const html = (await response.text()).slice(0, 2000000);
  const patterns = [/\bb_hotel_id\s*[:=]\s*['"]?([1-9]\d*)/, /\bdata-hotelid=['"]([1-9]\d*)/];
  const ids = [...new Set(patterns.flatMap(pattern => [...html.matchAll(new RegExp(pattern.source, 'g'))].map(match => match[1])))];
  if (ids.length !== 1) throw new Error('Booking: لم يمكن تحديد الفندق بدقة من الرابط؛ انسخ الرابط الكامل من صفحة الفندق');
  return { ...await client.hotelDetails({ ...request, hotelId: ids[0] }), bookingUrl: canonical.href, identityMethod: 'page-id-app-verified' };
}
