import { datePairs } from './almosafer-live.js';
import { almatarBeds } from './almatar-client.js';
import { UpstreamError, upstreamHttpError } from './upstream-error.js';

// Confirmed in com.moh.nusukapp 17.5.4 (Huawei version code 166816).
// The ordinary SDK flow skips Authorization; B2B/Hajj/account offers are not enabled.
export const NUSUK_API_ORIGIN = 'https://apiout.almatar.com';
export const nusukHeaders = Object.freeze({
  'User-Agent': 'okhttp/5.3.0', Accept: 'application/json',
  'Content-Type': 'application/json', 'Accept-Language': 'ar', 'Content-Language': 'ar',
  Platform: 'android', version: '7.0.0', Brand: '1', POS: 'SA', 'x-flow': 'B2C',
});
const fail = message => { throw new UpstreamError(`نسك: ${message}`, { source: 'nusuk', stage: 'packages', code: 'NUSUK_RESPONSE_INVALID' }); };
const assert = (condition, message) => { if (!condition) fail(message); };
const text = value => String(value ?? '').replace(/<[^>]*>/g, '').trim();
const iso = value => typeof value === 'number' ? new Date(value * 1000).toISOString().slice(0, 10) : null;
const nameKey = value => text(value).normalize('NFKC').replace(/\s+/g, ' ').toLowerCase();

export function validateNusukOccupancy(roomsInfo) {
  if (!Array.isArray(roomsInfo) || roomsInfo.length !== 1 || !Array.isArray(roomsInfo[0]?.kidsAges) || roomsInfo[0].kidsAges.length) {
    throw Object.assign(new Error('نسك يدعم حاليًا غرفة واحدة بدون أطفال؛ تسعير الحالات الأخرى لم يُتحقق منه بعد'), { status: 400 });
  }
  const adults = roomsInfo[0].adultsCount;
  if (!Number.isInteger(adults) || adults < 1 || adults > 8) throw Object.assign(new Error('عدد البالغين غير صالح'), { status: 400 });
  return adults;
}
export function toNusukRequest(payload) {
  validateNusukOccupancy(payload.roomsInfo);
  assert(datePairs(payload.checkIn, payload.checkOut).length === 1, 'طلب الأسعار يجب أن يغطي ليلة واحدة');
  assert(/^[1-9]\d*$/.test(String(payload.hotelId)), 'معرّف الفندق غير صالح');
  const mdy = date => { const [year, month, day] = date.split('-'); return `${month}/${day}/${year}`; };
  return { hotelId: Number(payload.hotelId), multiRoomMode: true, countryCode: payload.countryCode || 'SA',
    req: { cy: 'SAR', fd: mdy(payload.checkIn), td: mdy(payload.checkOut),
      rs: payload.roomsInfo.map(room => ({ ac: room.adultsCount, cc: 0, ka: [] })) } };
}
function planFor(label) {
  const value = text(label).toLowerCase();
  if (/كاملة|ثلاث وجبات|full.?board|all.?inclusive|\bfb\b/.test(value)) return null;
  if (/غداء|عشاء|نصف إقامة|وجبتين|half.?board|\bhb\b/.test(value)) return 'halfBoard';
  if (/إفطار|افطار|فطور|breakfast|\bbb\b/.test(value)) return 'breakfast';
  if (/إقامة فقط|اقامة فقط|غرفة فقط|بدون وجبات|بدون إفطار|room.?only|bed.?only|\bro\b/.test(value)) return 'roomOnly';
  return null;
}
export function validateNusukPacket(packet, payload, { completed = true, hotelName } = {}) {
  const data = packet?.data, request = data?.req;
  assert(data && Array.isArray(data.searchRoomsResults), 'رد الغرف ناقص أو غير صالح');
  assert(request?.cy === 'SAR', 'عملة الطلب في رد المصدر ليست SAR');
  assert(iso(request.fd) === payload.checkIn && iso(request.td) === payload.checkOut, 'تواريخ رد المصدر لا تطابق الطلب');
  const expected = payload.roomsInfo.map(room => ({ ac: room.adultsCount, cc: room.kidsAges.length, ka: room.kidsAges }));
  const actual = request.rs?.map(room => ({ ac: Number(room.ac), cc: Number(room.cc), ka: room.ka }));
  assert(JSON.stringify(actual) === JSON.stringify(expected), 'إشغال رد المصدر لا يطابق الطلب');
  assert(typeof data.isSearchCompleted === 'boolean', 'اكتمال بحث المصدر غير مؤكد');
  if (completed) assert(data.isSearchCompleted === true, 'بحث المصدر لم يكتمل');
  if (hotelName && data.sum?.hn) assert(nameKey(data.sum.hn) === nameKey(hotelName), 'اسم الفندق في رد الأسعار مختلف');
  if (!data.searchRoomsResults.length && completed) {
    assert(data.hotelIsAvailable === false && hotelName && nameKey(data.sum?.hn) === nameKey(hotelName), 'الرد الفارغ لا يؤكد عدم توفر الفندق المطلوب');
  }
  return data;
}
export function normalizeNusukRooms(packet, payload, { now = Date.now(), hotelName } = {}) {
  validateNusukOccupancy(payload.roomsInfo);
  const data = validateNusukPacket(packet, payload, { hotelName });
  const result = {}, seen = new Map();
  for (const group of data.searchRoomsResults) {
    assert(group && typeof group === 'object' && Array.isArray(group.packages), 'مجموعة عروض المصدر ناقصة');
    const packages = [group.defaultPackage, ...group.packages].filter(Boolean);
    assert(packages.length > 0, 'مجموعة الغرف لا تحتوي عروضًا قابلة للتدقيق');
    for (const pkg of packages) {
      assert(pkg.packageId && String(pkg.almtaarHotelId) === String(payload.hotelId), 'هوية الفندق أو العرض لا تطابق الطلب');
      assert(pkg.currency === 'SAR', 'عملة العرض ليست الريال السعودي');
      assert(Array.isArray(pkg.rooms) && pkg.rooms.length === 1, 'عدد الغرف في العرض غير مطابق');
      const room = pkg.rooms[0];
      assert(Number(room.adultsCount) === payload.roomsInfo[0].adultsCount && Array.isArray(room.kidsAges) && room.kidsAges.length === 0, 'النزلاء في العرض لا يطابقون الطلب');
      assert(!room.currency || room.currency === 'SAR', 'عملة الغرفة لا تطابق العرض');
      assert(typeof pkg.finalPrice === 'number' && Number.isFinite(pkg.finalPrice) && pkg.finalPrice > 0, 'سعر العرض غير صالح');
      assert(typeof room.finalPrice === 'number' && Math.abs(room.finalPrice - pkg.finalPrice) < 0.011, 'سعر الغرفة لا يطابق إجمالي العرض');
      assert(text(room.roomName), 'اسم الغرفة ناقص');
      const signature = JSON.stringify([room.roomName, room.bedType, room.roomView, room.roomSize, room.roomBasis, room.rateId, pkg.finalPrice, pkg.currency, pkg.isRefundable, pkg.refundableUntil]);
      assert(!seen.has(pkg.packageId) || seen.get(pkg.packageId) === signature, 'المصدر رجع أسعارًا متضاربة لنفس العرض');
      if (seen.has(pkg.packageId)) continue;
      seen.set(pkg.packageId, signature);
      if (pkg.bookable === false) continue;
      const plan = planFor(room.roomBasis);
      if (!plan) continue;
      assert(typeof pkg.isRefundable === 'boolean', 'سياسة الإلغاء غير مؤكدة');
      const until = pkg.refundableUntil;
      const expiry = typeof until === 'number' ? until * (until < 1e11 ? 1000 : 1) : Date.parse(until);
      const flexible = pkg.isRefundable && Number.isFinite(expiry) && expiry > now;
      const beds = almatarBeds(room);
      const identity = JSON.stringify([text(room.roomName), text(room.bedType), text(room.roomView), text(room.roomSize)]);
      result[identity] ||= { name: text(room.roomName), category: text(room.roomName), beds: [beds],
        beddingLabel: beds.label || 'لم يحدد المصدر', beddingVerified: beds.options.length > 0,
        originalNames: [text(room.roomName)], offers: {} };
      // PriceManager.getCeilPrice(float) in the APK; no web pricing formula is borrowed.
      const price = Math.ceil(Math.fround(pkg.finalPrice));
      const field = flexible ? `${plan}Flexible` : plan;
      const previous = result[identity].offers[field];
      if (previous && previous.price <= price) continue;
      result[identity].offers[field] = {
        price, totalPrice: price, sourceTotalPrice: pkg.finalPrice,
        originalPrice: typeof pkg.originalFinalPrice === 'number' ? Math.ceil(Math.fround(pkg.originalFinalPrice)) : null,
        sourceOriginalPrice: pkg.originalFinalPrice ?? null, sourceRounding: 'android-float-ceil',
        packageId: pkg.packageId, roomId: room.rateId ?? null, roomIdentity: identity,
        mealLabel: text(room.roomBasis), mealLabelFromSource: text(room.roomBasis),
        cancellationPolicy: text(pkg.refundability) || (pkg.isRefundable ? 'قابل للاسترداد حسب شروط العرض' : 'غير قابل للاسترداد'),
        refundableUntil: until || null, cancellationDetails: text(pkg.cancellationMessage) || null,
        sourceFinalTax: pkg.finalTax ?? null, taxBreakdown: null,
        appliedCouponCode: pkg.appliedCouponCode || null,
        source: 'Nusuk', sourceEndpoint: `${NUSUK_API_ORIGIN}/api/hotel/v5/rooms/getpackages/search_with_hotel`,
        appPackage: 'com.moh.nusukapp', appVersion: '17.5.4', sdkVersion: '7.0.0',
        hotelId: String(payload.hotelId), checkIn: payload.checkIn, checkOut: payload.checkOut,
        adults: payload.roomsInfo[0].adultsCount, rooms: 1, currency: 'SAR',
        fetchedAt: new Date(now).toISOString(), accountPricingVerified: false, screenPriceVerified: false,
      };
    }
  }
  return result;
}

export function createNusukClient({ fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now, timeout = 45000 } = {}) {
  const cache = new Map(), pending = new Map(), hotels = new Map();
  async function request(path, body, deadline, stage) {
    const remaining = deadline - now();
    if (remaining <= 0) fail('انتهت مهلة استعلام هذه الليلة');
    const url = NUSUK_API_ORIGIN + path;
    const response = await fetchImpl(url, { method: body ? 'POST' : 'GET', headers: nusukHeaders,
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(Math.min(30000, remaining)) });
    if (!response.ok) throw await upstreamHttpError(response, { source: 'nusuk', label: 'نسك', stage, url });
    try { return await response.json(); } catch { fail('المصدر لم يرجع JSON صالحًا'); }
  }
  async function hotel(profileKey) {
    assert(/^[^\s/?#]+-[1-9]\d*$/.test(profileKey), 'يلزم مفتاح صفحة الفندق الكامل');
    const cached = hotels.get(profileKey);
    if (cached?.expires > now()) return cached.value;
    const response = await request(`/api/almtaar/hotelbyprofilekey/${encodeURIComponent(profileKey)}`, null, now() + timeout, 'hotel-identity');
    const data = response?.data, id = profileKey.match(/-(\d+)$/)[1];
    assert(String(data?.almHotelCode) === id && data.almHotelProfileKey === profileKey && text(data.hotelBasicData?.name), 'هوية الفندق لم تتأكد من خدمة التطبيق');
    assert(data.hotelBasicData.countryCode === 'SA', 'نطاق نسك الحالي فنادق السعودية');
    const value = { hotelId: id, hotelProfileKey: profileKey, hotelName: text(data.hotelBasicData.name), hotelNameEn: text(data.hotelBasicData.name), countryCode: 'SA', baseSlug: `hotels/rooms/${profileKey}/` };
    if (hotels.size >= 500) hotels.delete(hotels.keys().next().value);
    hotels.set(profileKey, { value, expires: now() + 3600000 });
    return value;
  }
  async function rooms(payload, { refresh = false } = {}) {
    const body = toNusukRequest(payload), key = JSON.stringify({ ...body, profileKey: payload.hotelProfileKey });
    const cached = cache.get(key);
    if (!refresh && cached?.expires > now()) return cached.value;
    if (pending.has(key)) return pending.get(key);
    const work = (async () => {
      const details = await hotel(payload.hotelProfileKey);
      assert(details.hotelId === String(payload.hotelId), 'معرّف طلب الأسعار مختلف عن الفندق المتحقق منه');
      const deadline = now() + timeout;
      let packet = await request('/api/hotel/v5/rooms/getpackages/search_with_hotel', body, deadline, 'packages');
      for (let poll = 0; poll < 30; poll++) {
        const data = validateNusukPacket(packet, payload, { completed: false, hotelName: details.hotelName });
        if (data.isSearchCompleted) return normalizeNusukRooms(packet, payload, { now: now(), hotelName: details.hotelName });
        assert(typeof data.sd === 'string' && data.sd, 'بحث المصدر غير مكتمل ولا يحتوي جلسة متابعة');
        await sleep(800);
        packet = await request('/api/hotel/v4/rooms/getpackages/search_with_session_id',
          { almHotelId: Number(payload.hotelId), queueSessionId: data.sd }, deadline, 'poll');
      }
      fail('بحث المصدر لم يكتمل');
    })().then(value => {
      for (const [id, entry] of cache) if (entry.expires <= now()) cache.delete(id);
      if (cache.size >= 500) cache.delete(cache.keys().next().value);
      cache.set(key, { value, expires: now() + (Object.keys(value).length ? 120000 : 20000) });
      return value;
    }).finally(() => pending.delete(key));
    pending.set(key, work);
    return work;
  }
  return { hotel, rooms };
}
