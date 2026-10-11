import { datePairs } from './scrapers/almosafer-live.js';
import { recordSourceSuccess, recordSourceFailure } from './scrapers/source-status.js';

const invalid = message => { const error = new Error(message); error.status = 400; throw error; };
export function detectHotelSource(input) {
  if (/^booking:/i.test(input || '')) return 'booking';
  try {
    const host = new URL(input).hostname;
    return ['almosafer', 'almatar', 'booking'].find(source => host === `${source}.com` || host.endsWith(`.${source}.com`)) || null;
  } catch { return null; }
}

export function createHotelRoomsService({ resolveAlmosafer, enigmaClient, resolveAlmatar, fetchOneNight, resolveBooking, bookingClient, now = Date.now }) {
  const cache = new Map(), pending = new Map();
  return async function hotelRooms(body) {
    const hotelInput = String(body.hotelInput || '').trim();
    if (!hotelInput) invalid('hotelInput مطلوب');
    const detected = detectHotelSource(hotelInput), source = body.source || detected;
    if (!['almosafer', 'almatar', 'booking'].includes(source)) invalid('يرجى تحديد المصدر أو إدخال رابط فندق صالح');
    if (detected && source !== detected) invalid('مصدر البحث لا يطابق رابط الفندق');
    const adults = Number(body.adults ?? 2), rooms = Number(body.rooms ?? 1), childAges = body.childAges ?? [];
    const children = Number(body.children ?? childAges.length);
    if (!Number.isInteger(adults) || adults < 1 || adults > 8 || !Number.isInteger(rooms) || rooms < 1 || rooms > 4) invalid('عدد الأفراد أو الغرف غير صالح');
    if (!Array.isArray(childAges) || !Number.isInteger(children) || children < 0 || children !== childAges.length || childAges.some(age => !Number.isInteger(age) || age < 0 || age > 17)) invalid('يلزم تحديد أعمار الأطفال للحصول على سعر صحيح');
    if (source === 'booking' && (rooms !== 1 || children !== 0)) invalid('Booking يدعم حاليًا غرفة واحدة بدون أطفال');
    const checkIn = body.checkIn || new Date(now() + 86400000).toISOString().slice(0, 10);
    let checkOut;
    try {
      checkOut = new Date(Date.parse(`${checkIn}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
      datePairs(checkIn, checkOut);
    } catch { invalid('تاريخ الوصول غير صالح'); }
    // Only the requested first night is used for the room selector, never a later date.
    const params = { checkIn, checkOut, adults, rooms, children, childAges };
    const key = JSON.stringify({ source, hotelInput, ...params });
    const cached = cache.get(key);
    if (!body.refresh && cached && cached.expires > now()) return cached.value;
    if (pending.has(key)) return pending.get(key);
    const work = (async () => {
      let details, names;
      if (source === 'almosafer') {
        details = await resolveAlmosafer(hotelInput, params);
        if (!details.hotelId) invalid('رابط المسافر لا يحتوي معرّف الفندق');
        const rates = await enigmaClient({ hotelId: String(details.hotelId), ...(details.sourceOrigin ? { sourceOrigin: details.sourceOrigin } : {}), checkIn, checkOut, roomsInfo: Array.from({ length: rooms }, () => ({ adultsCount: adults, kidsAges: childAges })), currency: 'SAR' }, { refresh: Boolean(body.refresh) });
        names = Object.values(rates).map(room => room.name || room.category);
      } else if (source === 'almatar') {
        details = await resolveAlmatar(hotelInput);
        if (!details.hotelId || !details.hotelProfileKey) invalid('رابط المطار لا يحتوي معرّف الفندق');
        const data = await fetchOneNight({ hotelId: details.hotelId, hotelProfileKey: details.hotelProfileKey, countryCode: details.countryCode || '', checkIn, checkOut, adults, rooms, childAges, fastRoomsOnly: true, refresh: Boolean(body.refresh) });
        names = (data.rooms || []).map(room => room.roomName);
      } else {
        details = await resolveBooking(hotelInput, params);
        const rates = await bookingClient.rooms({ hotelId: details.hotelId, checkIn, checkOut, roomsInfo: [{ adultsCount: adults, kidsAges: childAges }] }, { refresh: Boolean(body.refresh) });
        names = Object.values(rates).map(room => room.name);
      }
      recordSourceSuccess(source);
      const value = { success: true, rooms: [...new Set(names.filter(Boolean))], hotelName: details.hotelName, hotelNameEn: details.hotelNameEn || details.hotelName, hotelId: String(details.hotelId), source, checkIn, checkOut, adults, children, requestedRooms: rooms, fetchedAt: new Date(now()).toISOString() };
      if (cache.size >= 500) cache.delete(cache.keys().next().value);
      cache.set(key, { value, expires: now() + (value.rooms.length ? 120000 : 5000) });
      return value;
    })().catch(error => { if (error.status !== 400) recordSourceFailure(source, error); throw error; }).finally(() => pending.delete(key));
    pending.set(key, work);
    return work;
  };
}
