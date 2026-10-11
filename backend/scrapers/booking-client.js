import { createHash, randomUUID } from 'node:crypto';
import { upstreamHttpError, UpstreamError } from './upstream-error.js';

export function bookingConfigured(env = process.env) {
  return Boolean(env.BOOKING_APP_AUTHORIZATION && env.BOOKING_APP_SIGNATURE_SALT && env.BOOKING_APP_VERSION);
}
const fail = message => { throw new Error(`Booking: ${message}`); };
const assert = (ok, message) => { if (!ok) fail(message); };
const clean = value => String(value || '').replace(/<[^>]*>/g, '').trim();

export function bookingHotelId(input) {
  const text = String(input || '').trim();
  if (/^(?:booking:)?[1-9]\d*$/i.test(text)) return text.replace(/^booking:/i, '');
  try {
    const url = new URL(text);
    assert(url.hostname === 'booking.com' || url.hostname.endsWith('.booking.com'), 'استخدم رابط Booking أو booking: ثم رقم الفندق');
    const id = url.searchParams.get('hotel_id') || url.searchParams.get('hotelId') || (url.searchParams.get('dest_type') === 'hotel' ? url.searchParams.get('dest_id') : null);
    if (/^[1-9]\d*$/.test(id || '')) return id;
  } catch (error) { if (error.message.startsWith('Booking:')) throw error; }
  fail('يلزم معرّف الفندق: booking:184752 مثلًا، أو رابط Booking يحتوي hotel_id أو dest_id مع dest_type=hotel. رابط الاسم وحده غير مدعوم حاليًا.');
}

export function validateBookingOccupancy(roomsInfo) {
  assert(Array.isArray(roomsInfo) && roomsInfo.length === 1, 'المتاح حاليًا غرفة واحدة لكل بحث؛ دعم عدة غرف لم يُتحقق منه بعد.');
  const { adultsCount, kidsAges } = roomsInfo[0];
  assert(Number.isInteger(adultsCount) && adultsCount >= 1 && adultsCount <= 8, 'عدد البالغين غير صالح');
  assert(Array.isArray(kidsAges) && kidsAges.length === 0, 'أسعار الأطفال غير مدعومة حاليًا في مصدر Booking.');
  return adultsCount;
}

export function validateBookingHotel(payload, request) {
  assert(Array.isArray(payload), 'رد التطبيق ليس قائمة فنادق صالحة');
  const matches = payload.filter(h => String(h?.hotel_id) === String(request.hotelId));
  assert(matches.length === 1, 'الفندق في الرد لا يطابق الطلب');
  const hotel = matches[0];
  assert(hotel.arrival_date === request.checkIn && hotel.departure_date === request.checkOut, 'التواريخ في الرد لا تطابق الطلب');
  assert(hotel.currency_code === 'SAR', 'عملة الرد ليست الريال السعودي');
  const adults = validateBookingOccupancy(request.roomsInfo);
  assert(Number(hotel.min_room_distribution?.adults) === adults && Array.isArray(hotel.min_room_distribution?.children) && hotel.min_room_distribution.children.length === 0, 'توزيع النزلاء في الرد لا يطابق الطلب');
  return hotel;
}

function bedsForRoom(room) {
  const options = [];
  for (const configuration of room.bed_configurations || []) {
    const parts = (configuration.bed_types || []).map(b => {
      const name = String(b.name || '').toLowerCase();
      const type = /super.king|extra.large|king/.test(name) ? 'king' : /queen/.test(name) ? 'queen' : /single|twin/.test(name) ? 'single' : /double/.test(name) ? 'double' : null;
      return { count: Number(b.count), type, label: clean(b.name_with_count || b.name) };
    });
    if (!parts.length || parts.some(p => !p.type || !Number.isInteger(p.count) || p.count < 1)) continue;
    options.push({ count: parts.reduce((n, p) => n + p.count, 0), type: parts.every(p => p.type === parts[0].type) ? parts[0].type : 'mixed', parts });
  }
  const label = options.map(o => o.parts.map(p => p.label).join(' + ')).join(' / ');
  return { beds: [{ label, options }], beddingLabel: label || 'لم يحدد المصدر', beddingVerified: options.length > 0 };
}

export function normalizeBookingRooms(payload, request) {
  const hotel = validateBookingHotel(payload, request);
  const adults = request.roomsInfo[0].adultsCount;
  assert(Array.isArray(hotel.block) && Number(hotel.total_blocks) === hotel.block.length, 'قائمة عروض الغرف غير مكتملة');
  const result = {}, seen = new Set();
  for (const block of hotel.block) {
    assert(block.block_id && !seen.has(block.block_id), 'معرّف العرض مفقود أو مكرر');
    seen.add(block.block_id);
    // Incompatible rates are never substituted for the requested occupancy.
    if (Number(block.is_block_fit) !== 1 || Number(block.nr_adults) !== adults || Number(block.nr_children) !== 0) continue;
    assert(Number(block.fit_occupancy?.nr_adults) === adults && Array.isArray(block.fit_occupancy?.children_ages) && block.fit_occupancy.children_ages.length === 0, 'إشغال العرض غير مطابق');
    assert(block.min_price?.currency === 'SAR', 'عملة العرض غير مطابقة');
    const price = Number(block.min_price.price);
    assert(Number.isFinite(price) && price > 0, 'سعر العرض غير صالح');
    assert(['breakfast_included', 'half_board', 'full_board', 'all_inclusive'].every(k => [0, 1].includes(Number(block[k]))), 'بيانات الوجبات غير مكتملة');
    assert([0, 1].includes(Number(block.refundable)), 'بيانات الإلغاء غير مكتملة');
    const roomId = String(block.room_id), room = hotel.rooms?.[roomId];
    assert(room, 'تفاصيل الغرفة مفقودة');
    if (Number(block.full_board) || Number(block.all_inclusive)) continue;
    const plan = Number(block.half_board) ? 'halfBoard' : Number(block.breakfast_included) ? 'breakfast' : 'roomOnly';
    const name = clean(block.room_name || block.name_without_policy);
    assert(name, 'اسم الغرفة مفقود');
    const key = `booking:${request.hotelId}:${roomId}`;
    result[key] ||= { name, category: name, originalNames: [name], ...bedsForRoom(room), offers: {} };
    const refundable = Number(block.refundable) === 1;
    const offer = {
      price, totalPrice: price, packageId: block.block_id, roomId,
      source: 'Booking Android app API', priceField: 'mobile.roomList.block.min_price.price',
      priceBasis: 'source-display-price-with-requested-taxes', currency: 'SAR',
      mealLabel: ({ roomOnly: 'إقامة فقط', breakfast: 'إقامة وإفطار', halfBoard: 'نصف إقامة' })[plan], mealLabelFromSource: clean(block.mealplan), refundable,
      refundableUntil: block.refundable_until || null,
      cancellationPolicy: refundable ? `إلغاء مجاني حسب شروط العرض${block.refundable_until ? ` حتى ${block.refundable_until}` : ''}` : 'غير قابل للاسترداد',
    };
    // roomList is the displayed taxed price; adding hotelPage taxes doubles them.
    if (!result[key].offers[plan] || price < result[key].offers[plan].price) result[key].offers[plan] = offer;
    if (refundable && (!result[key].offers[`${plan}Flexible`] || price < result[key].offers[`${plan}Flexible`].price)) result[key].offers[`${plan}Flexible`] = offer;
  }
  return result;
}

export function createBookingClient({ env = process.env, fetchImpl = fetch } = {}) {
  const deviceId = env.BOOKING_APP_DEVICE_ID || randomUUID().replaceAll('-', '');
  const cache = new Map(), pending = new Map();
  async function request(endpoint, params) {
    assert(bookingConfigured(env), 'إعدادات الاتصال بالتطبيق غير موجودة على الخادم');
    const query = new URLSearchParams({ user_version: `${env.BOOKING_APP_VERSION}-android`, languagecode: 'en-gb', user_os: '15', device_id: deviceId, network_type: 'wifi', display: 'normal_xxhdpi', ...params }).toString();
    let response;
    try {
      response = await fetchImpl(`https://mobile-apps.booking.com/json/${endpoint}?${query}`, {
        headers: { Authorization: env.BOOKING_APP_AUTHORIZATION, 'B-S': `1,${createHash('sha1').update(query + env.BOOKING_APP_SIGNATURE_SALT).digest('hex')}`, Accept: 'application/json', 'X-LIBRARY': 'okhttp+network-api', 'User-Agent': `Booking.com Android App ${env.BOOKING_APP_VERSION} (OS: 15; Type: mobile; AppStore: google; Brand: Google; Model: Pixel 8;)` },
        signal: AbortSignal.timeout(25000), redirect: 'error',
      });
    } catch { throw new UpstreamError('Booking: تعذر الاتصال بواجهة التطبيق أو انتهت مهلة الطلب', { source: 'booking', stage: endpoint, code: 'UPSTREAM_NETWORK_ERROR' }); }
    if (!response.ok) throw await upstreamHttpError(response, { source: 'booking', label: 'Booking', stage: endpoint, url: `https://mobile-apps.booking.com/json/${endpoint}` });
    try { return await response.json(); } catch { fail('رد التطبيق ليس JSON صالحًا'); }
  }
  const paramsFor = input => {
    const adults = validateBookingOccupancy(input.roomsInfo);
    return { hotel_id: input.hotelId, currency_code: 'SAR', arrival_date: input.checkIn, departure_date: input.checkOut, rec_guest_qty: String(adults), rec_room_qty: '1', rec_children_qty: '0', detail_level: '1', include_taxes: '1', show_extra_charges: '1', include_mealplan: '1', show_occupancy_for_price: '1', include_paymentterms: '1', include_detail_mealplan: '1', include_cancellation_timeline: '1', include_sleeping_clarity: '1', no_html: '1' };
  };
  return {
    async hotelDetails(input) {
      const hotel = validateBookingHotel(await request('mobile.hotelPage', paramsFor(input)), input);
      assert(clean(hotel.hotel_name), 'اسم الفندق مفقود');
      return { hotelId: String(hotel.hotel_id), hotelName: clean(hotel.hotel_name), baseSlug: `hotel/${hotel.hotel_id}`, bookingUrl: /^https:\/\/(?:www\.)?booking\.com\//.test(hotel.url || '') ? hotel.url : null };
    },
    async rooms(input, { refresh = false } = {}) {
      const params = paramsFor(input), key = JSON.stringify(params), stored = cache.get(key);
      if (!refresh && stored && Date.now() - stored.at < 120000) return stored.value;
      if (pending.has(key)) return pending.get(key);
      const work = (async () => {
        const value = normalizeBookingRooms(await request('mobile.roomList', params), input);
        if (cache.size >= 500) cache.delete(cache.keys().next().value);
        cache.set(key, { at: Date.now(), value });
        return value;
      })();
      pending.set(key, work);
      try { return await work; } finally { pending.delete(key); }
    },
  };
}
