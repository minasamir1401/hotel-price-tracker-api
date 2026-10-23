import { datePairs, createLiveScraper } from './scrapers/almosafer-live.js';
import { recordSourceSuccess, recordSourceFailure } from './scrapers/source-status.js';
import { roomInventoryStore } from './room-inventory.js';
import { forEachNight, fatalInventoryError } from './scrapers/night-workers.js';

const invalid = message => { const error = new Error(message); error.status = 400; throw error; };
export function detectHotelSource(input) {
  let text = String(input || '').trim();
  if (/^booking:/i.test(text)) return 'booking';
  if (/^nusuk:/i.test(text)) return 'nusuk';
  if (!text.startsWith('http://') && !text.startsWith('https://') && /^(?:www\.)?booking\.com/i.test(text)) {
    return 'booking';
  }
  try {
    const host = new URL(text).hostname;
    if (['nusuk.almatar.com', 'apiout.almatar.com'].includes(host)) return 'nusuk';
    return ['almosafer', 'almatar', 'booking'].find(source => host === `${source}.com` || host.endsWith(`.${source}.com`)) || null;
  } catch { return null; }
}

export function createHotelRoomsService({ resolveAlmosafer, enigmaClient, resolveAlmatar, fetchOneNight, resolveBooking, bookingClient, resolveNusuk, nusukClient, now = Date.now, inventoryStore = roomInventoryStore }) {
  const cache = new Map(), pending = new Map();
  return async function hotelRooms(body) {
    let hotelInput = String(body.hotelInput || '').trim();
    if (!hotelInput) invalid('hotelInput مطلوب');
    if (!hotelInput.startsWith('http://') && !hotelInput.startsWith('https://') && /^(?:www\.)?booking\.com/i.test(hotelInput)) {
      hotelInput = 'https://' + hotelInput;
    }
    const detected = detectHotelSource(hotelInput), source = body.source || detected;
    if (!['almosafer', 'almatar', 'booking', 'nusuk'].includes(source)) invalid('يرجى تحديد المصدر أو إدخال رابط فندق صالح');
    if (detected && source !== detected && !(source === 'nusuk' && detected === 'almatar')) invalid('مصدر البحث لا يطابق رابط الفندق');
    const adults = Number(body.adults ?? 2), rooms = Number(body.rooms ?? 1), childAges = body.childAges ?? [];
    const children = Number(body.children ?? childAges.length);
    if (!Number.isInteger(adults) || adults < 1 || adults > 8 || !Number.isInteger(rooms) || rooms < 1 || rooms > 4) invalid('عدد الأفراد أو الغرف غير صالح');
    if (!Array.isArray(childAges) || !Number.isInteger(children) || children < 0 || children !== childAges.length || childAges.some(age => !Number.isInteger(age) || age < 0 || age > 17)) invalid('يلزم تحديد أعمار الأطفال للحصول على سعر صحيح');
    if (source === 'booking' && (rooms !== 1 || children !== 0)) invalid('Booking يدعم حاليًا غرفة واحدة بدون أطفال');
    if (source === 'nusuk' && (rooms !== 1 || children !== 0)) invalid('نسك يدعم حاليًا غرفة واحدة بدون أطفال');
    const checkIn = body.checkIn || new Date(now() + 86400000).toISOString().slice(0, 10);
    let checkOut, pairs;
    try {
      checkOut = body.checkOut || new Date(Date.parse(`${checkIn}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
      pairs = datePairs(checkIn, checkOut);
    } catch { invalid('تواريخ الإقامة غير صالحة (بحد أقصى 62 ليلة)'); }
    const params = { checkIn, checkOut, adults, rooms, children, childAges, ...(source === 'booking' ? { bookingRateMode: body.bookingRateMode } : {}) };
    const scopedBooking = source === 'booking' ? (bookingClient.forPricingMode?.(body.bookingRateMode) || bookingClient) : null;
    const key = JSON.stringify({ source, hotelInput, ...params, ...(scopedBooking ? { pricingScope: scopedBooking.scopeId } : {}) });
    const cached = cache.get(key);
    if (!body.refresh && cached && cached.expires > now()) return cached.value;
    if (pending.has(key)) return pending.get(key);
    const work = (async () => {
      let details, names, roomInventoryId;
      const availability = new Map(), warnings = [];
      const addRoom = (name, date) => {
        if (!name) return;
        if (!availability.has(name)) availability.set(name, new Set());
        availability.get(name).add(date);
      };
      if (source === 'almosafer') {
        details = await resolveAlmosafer(hotelInput, params);
        if (!details.hotelId) invalid('رابط المسافر لا يحتوي معرّف الفندق');
        // Use the same scan as the price table, so a later room is discoverable
        // and successful quotes can be reused by the following search.
        // Discovery returns its first pass promptly. Unverified dates are shown
        // explicitly and can be retried from the daily table on demand.
        const scan = createLiveScraper(async () => details, enigmaClient, { inventoryStore, repairFailedNights: false });
        const inventory = await scan({ hotelInput, ...params, refresh: Boolean(body.refresh), onProgress: body.onProgress });
        for (const room of inventory) for (const day of room.dailyRates) {
          if (day.availability === 'available') addRoom(room.roomName, day.date);
        }
        const uniqueWarnings = new Map(inventory.flatMap(room => room.warnings || []).map(w => [w.date, w]));
        warnings.push(...uniqueWarnings.values());
        // The next search keeps unverified nights and their errors too. It must
        // not scrape successful dates again just because another date failed.
        roomInventoryId = inventoryStore.put({ hotelInput, ...params }, inventory);
      } else {
        details = source === 'almatar' ? await resolveAlmatar(hotelInput)
          : source === 'nusuk' ? await resolveNusuk(hotelInput, params)
          : await resolveBooking(hotelInput, params, scopedBooking);
        if (!details.hotelId || (source === 'almatar' && !details.hotelProfileKey)) invalid('رابط الفندق لا يحتوي معرّف الفندق');
        let completed = 0, fatal, firstError;
        await forEachNight(pairs, 4, async dp => {
          try {
            let dailyNames;
            if (source === 'almatar') {
              const data = await fetchOneNight({ hotelId: details.hotelId, hotelProfileKey: details.hotelProfileKey, countryCode: details.countryCode || '', checkIn: dp.date, checkOut: dp.nextDate, adults, rooms, childAges, fastRoomsOnly: true, refresh: Boolean(body.refresh) });
              dailyNames = (data.rooms || []).map(room => room.roomName);
            } else {
              const client = source === 'nusuk' ? nusukClient : scopedBooking;
              const rates = await client.rooms({ hotelId: details.hotelId,
                ...(source === 'nusuk' ? { hotelProfileKey: details.hotelProfileKey, countryCode: details.countryCode } : {}),
                checkIn: dp.date, checkOut: dp.nextDate, roomsInfo: [{ adultsCount: adults, kidsAges: childAges }] }, { refresh: Boolean(body.refresh) });
              dailyNames = Object.values(rates).map(room => room.name);
            }
            for (const name of dailyNames) addRoom(name, dp.date);
          } catch (error) {
            firstError ||= error;
            if (fatalInventoryError(error)) fatal = error;
            warnings.push({ date: dp.date, message: error.message });
          }
          completed++;
          body.onProgress?.({ completed, total: pairs.length, percent: Math.round(completed / pairs.length * 100) });
        }, () => Boolean(fatal));
        if (fatal) throw fatal;
        if (!availability.size && firstError) throw firstError;
      }
      names = [...availability.keys()];
      recordSourceSuccess(source);
      const roomAvailability = names.map(name => ({ name, availableDates: [...availability.get(name)].sort(), availableNights: availability.get(name).size, totalNights: pairs.length }));
      const value = { success: true, rooms: names, roomAvailability, roomInventoryId, warnings, hotelName: details.hotelName, hotelNameEn: details.hotelNameEn || details.hotelName, hotelId: String(details.hotelId), source, checkIn, checkOut, adults, children, requestedRooms: rooms, fetchedAt: new Date(now()).toISOString() };
      if (cache.size >= 500) cache.delete(cache.keys().next().value);
      if (!warnings.length) cache.set(key, { value, expires: now() + (value.rooms.length ? 120000 : 5000) });
      return value;
    })().catch(error => { if (error.status !== 400) recordSourceFailure(source, error); throw error; }).finally(() => pending.delete(key));
    pending.set(key, work);
    return work;
  };
}
