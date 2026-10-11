import { bookingHotelId } from './booking-client.js';
import { resolveBookingHotelIdViaBrowser } from './almosafer-browser.js';

function propertyUrl(input) {
  try {
    const url = new URL(input);
    if (!['https:', 'http:'].includes(url.protocol) || !(url.hostname === 'booking.com' || url.hostname.endsWith('.booking.com'))) throw new Error();
    return url;
  } catch { throw new Error('Booking: أدخل رابط صفحة فندق صالح من Booking'); }
}

function linkedRoomIds(url) {
  const values = ['matching_block_id', 'highlighted_blocks', 'all_sr_blocks', 'sr_pri_blocks'].flatMap(key => url.searchParams.getAll(key));
  return [...new Set(values.flatMap(value => value.split(',')).map(value => value.match(/^([1-9]\d+)_\d+_\d+_\d+_\d+(?:__\d+)?$/)?.[1]).filter(Boolean))];
}

export function decodedBookingHotelId(decoded) {
  const ids = [];
  for (const data of [decoded, decoded?.additional_parameters]) {
    if (data?.dest_type === 'hotel' && /^[1-9]\d*$/.test(String(data.dest_id || ''))) ids.push(String(data.dest_id));
  }
  if (decoded?.booking_url) {
    try {
      const link = new URL(decoded.booking_url);
      if (link.protocol === 'booking:' || (link.protocol === 'https:' && (link.hostname === 'booking.com' || link.hostname.endsWith('.booking.com')))) {
        if (link.searchParams.get('dest_type') === 'hotel' && /^[1-9]\d*$/.test(link.searchParams.get('dest_id') || '')) ids.push(link.searchParams.get('dest_id'));
      }
    } catch { /* Invalid app deeplink cannot identify a property. */ }
  }
  const unique = [...new Set(ids)];
  if (unique.length > 1) throw new Error('Booking: رجع التطبيق معرّفات فنادق متعارضة للرابط');
  return unique[0] || null;
}

export async function resolveBookingUrl(input, request, client, { fetchImpl = fetch } = {}) {
  let explicitId;
  try { explicitId = bookingHotelId(input); } catch { /* property links can contain room IDs */ }
  if (explicitId) return client.hotelDetails({ ...request, hotelId: explicitId });
  const url = propertyUrl(input), roomIds = linkedRoomIds(url);
  // Use the app's own public link decoder for both property slugs and Share links.
  // No web session, guessed hotel identity, or displayed search-result price is used.
  if (client.decodeUrl) {
    const hotelId = decodedBookingHotelId(await client.decodeUrl(url.origin + url.pathname));
    if (hotelId) return { ...await client.hotelDetails({ ...request, hotelId }), identityMethod: 'app-link-decoder' };
    throw new Error('Booking: التطبيق لم يحدد فندقًا من الرابط؛ استخدم رابط صفحة الفندق أو رابط Share خاص بالفندق');
  }
  if (roomIds.length) {
    const candidates = [...new Set(roomIds.map(id => id.slice(0, -2)).filter(id => /^[1-9]\d*$/.test(id)))];
    if (candidates.length === 1) {
      const hotelId = candidates[0];
      const details = await client.hotelDetails({ ...request, hotelId });
      // Property metadata includes recommended rooms even when roomList has no extra offers.
      if (roomIds.every(id => details.linkedRoomIds?.includes(id))) return { ...details, bookingUrl: url.origin + url.pathname, identityMethod: 'app-verified-linked-rooms' };
      const rates = await client.rooms({ ...request, hotelId });
      const returnedIds = new Set(Object.values(rates).flatMap(room => Object.values(room.offers || {}).map(offer => String(offer.roomId))));
      if (roomIds.every(id => returnedIds.has(id))) return { ...details, bookingUrl: url.origin + url.pathname, identityMethod: 'app-verified-linked-rooms' };
      throw new Error('Booking: لم يؤكد التطبيق أن الغرف الموجودة في الرابط تخص هذا الفندق؛ انسخ رابط الفندق الحالي من Booking');
    }
  }

  const canonical = new URL(url.pathname, 'https://www.booking.com');
  let response;
  try {
    response = await fetchImpl(canonical.href, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ar,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000)
    });
  } catch {
    throw new Error('Booking: تعذر تحديد الفندق من الرابط؛ انسخ الرابط الكامل الذي يحتوي بيانات الغرف');
  }

  if (!response || response.status !== 200) {
    const urlId = url.searchParams.get('hotel_id') ||
      url.searchParams.get('hotelId') ||
      url.searchParams.get('sr_hotel_id') ||
      (url.searchParams.get('dest_type') === 'hotel' ? url.searchParams.get('dest_id') : null) ||
      url.pathname.match(/-(\d{5,})\.[a-z]{2,5}$/)?.[1] ||
      url.pathname.match(/\/hotel\/(\d{5,})/)?.[1];
    if (urlId) return { ...await client.hotelDetails({ ...request, hotelId: urlId }), bookingUrl: canonical.href, identityMethod: 'url-param-verified' };

    if (fetchImpl === fetch) {
      const browserId = await resolveBookingHotelIdViaBrowser(canonical.href);
      if (browserId) {
        return { ...await client.hotelDetails({ ...request, hotelId: browserId }), bookingUrl: canonical.href, identityMethod: 'browser-resolved' };
      }
    }

    throw new Error('Booking: المصدر لم يسمح باستخراج معرّف الفندق من هذا الرابط؛ انسخ الرابط الكامل الذي يحتوي بيانات الغرف');
  }

  const html = (await response.text()).slice(0, 2000000);
  const patterns = [
    /\bb_hotel_id\s*[:=]\s*['"]?([1-9]\d*)/,
    /\bdata-hotelid=['"]([1-9]\d*)/,
  ];
  const ids = [...new Set(patterns.flatMap(pattern => [...html.matchAll(new RegExp(pattern.source, 'g'))].map(match => match[1])))];
  if (ids.length !== 1) {
    if (fetchImpl === fetch) {
      const browserId = await resolveBookingHotelIdViaBrowser(canonical.href);
      if (browserId) {
        return { ...await client.hotelDetails({ ...request, hotelId: browserId }), bookingUrl: canonical.href, identityMethod: 'browser-resolved' };
      }
    }
    throw new Error('Booking: لم يمكن تحديد الفندق بدقة من الرابط؛ انسخ الرابط الكامل من صفحة الفندق');
  }

  return { ...await client.hotelDetails({ ...request, hotelId: ids[0] }), bookingUrl: canonical.href, identityMethod: 'page-id-app-verified' };
}
