import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingHotelId, normalizeBookingRooms, createBookingClient } from '../scrapers/booking-client.js';
import { createLiveScraper } from '../scrapers/almosafer-live.js';
import { executeHotelComparison } from '../scrapers/index.js';
import { resolveBookingUrl, decodedBookingHotelId } from '../scrapers/booking-url.js';

const input = { hotelId: '184752', checkIn: '2026-10-20', checkOut: '2026-10-21', roomsInfo: [{ adultsCount: 2, kidsAges: [] }] };
const payload = () => [{ hotel_id: 184752, arrival_date: input.checkIn, departure_date: input.checkOut, currency_code: 'SAR', min_room_distribution: { adults: 2, children: [] }, total_blocks: 2,
  rooms: { '10': { bed_configurations: [{ bed_types: [{ name: 'Single bed', count: 2, name_with_count: '2 single beds' }] }] } },
  block: [0, 1].map(refundable => ({ block_id: `native-${refundable}`, room_id: 10, room_name: 'Twin Kaaba view', nr_adults: 2, nr_children: 0, fit_occupancy: { nr_adults: 2, children_ages: [] }, is_block_fit: 1, min_price: { price: refundable ? '2795.36' : '2527.90', currency: 'SAR', extra_charges: 434.40 }, breakfast_included: 1, half_board: 0, full_board: 0, all_inclusive: 0, refundable, mealplan: 'Breakfast included' })),
  tpi_block: [{ room_id: 'supplier', min_price: { price: '1', currency: 'SAR' } }],
}];

test('Booking validates hotel URLs and IDs without accepting other domains', () => {
  assert.equal(bookingHotelId('booking:184752'), '184752');
  assert.equal(bookingHotelId('https://www.booking.com/hotel/sa/a.html?hotel_id=184752'), '184752');
  assert.equal(bookingHotelId('https://www.booking.com/hotel/sa/al-marwa-rayhaan-makkah.ar.html?dest_id=184752&dest_type=hotel&checkin=2026-10-20'), '184752');
  assert.throws(() => bookingHotelId('https://www.booking.com/searchresults.html?dest_id=184752&dest_type=city'), /Booking:/);
  for (const text of ['https://booking.com.evil.test/?hotel_id=184752', 'https://www.booking.com/hotel/sa/a.html', '-1']) assert.throws(() => bookingHotelId(text), /Booking:/);
});
test('Booking keeps displayed taxes once, exact beds, meals, native rate IDs and flexible rates', () => {
  const result = normalizeBookingRooms(payload(), input), room = Object.values(result)[0];
  assert.equal(Object.keys(result).length, 1);
  assert.equal(room.offers.breakfast.price, 2527.90);
  assert.equal(room.offers.breakfastFlexible.price, 2795.36);
  assert.equal(room.offers.breakfast.packageId, 'native-0');
  assert.equal(room.beds[0].options[0].type, 'single');
  assert.equal(room.beds[0].options[0].count, 2);
  assert.equal(room.offers.roomOnly, undefined);
});
test('Booking rejects inconsistent dates, identity, currency, guests and incomplete offers', () => {
  for (const change of [h => h.hotel_id = 99, h => h.arrival_date = '2026-10-19', h => h.currency_code = 'USD', h => h.min_room_distribution.adults = 1, h => h.total_blocks = 3, h => h.block[0].min_price.price = 'NaN', h => h.block[0].min_price.currency = 'USD', h => delete h.block[0].half_board, h => h.block[0].fit_occupancy.nr_adults = 1]) {
    const data = payload(); change(data[0]); assert.throws(() => normalizeBookingRooms(data, input), /Booking:/);
  }
  assert.throws(() => normalizeBookingRooms(payload(), { ...input, roomsInfo: [...input.roomsInfo, ...input.roomsInfo] }), /غرفة واحدة/);
  assert.throws(() => normalizeBookingRooms(payload(), { ...input, roomsInfo: [{ adultsCount: 2, kidsAges: [7] }] }), /الأطفال/);
});
test('Booking failures are retriable and completed requests are cached', async () => {
  let calls = 0;
  const client = createBookingClient({ env: { BOOKING_APP_AUTHORIZATION: 'test', BOOKING_APP_SIGNATURE_SALT: 'test', BOOKING_APP_VERSION: 'test' }, fetchImpl: async () => {
    calls++;
    if (calls === 1) return { ok: false, status: 401 };
    return { ok: true, json: async () => payload() };
  } });
  await assert.rejects(client.rooms(input), /HTTP 401/);
  await client.rooms(input); await client.rooms(input); assert.equal(calls, 3);
});

test('Booking requests recommended blocks and uses the complete roomList tax-inclusive quote', async () => {
  const calls = [];
  const client = createBookingClient({ env: { BOOKING_APP_AUTHORIZATION: 'test', BOOKING_APP_SIGNATURE_SALT: 'test', BOOKING_APP_VERSION: 'test' }, fetchImpl: async url => {
    const parsed = new URL(url); calls.push(parsed);
    const data = payload();
    if (parsed.pathname.endsWith('mobile.hotelPage')) {
      data[0].total_blocks = 0;
      data[0].block[0].min_price.price = '143.00';
      return { ok: true, json: async () => data };
    }
    assert.equal(parsed.searchParams.get('block_ids'), 'native-0,native-1');
    assert.equal(parsed.searchParams.get('include_is_block_fit'), '1');
    assert.equal(parsed.searchParams.get('move_room_info_from_block_to_room'), '1');
    data[0].block[0].min_price.price = '168.03';
    return { ok: true, json: async () => data };
  } });
  assert.equal(Object.values(await client.rooms(input))[0].offers.breakfast.price, 168.03);
  await client.rooms(input);
  assert.equal(calls.length, 2);
});

test('Booking does not cache missing recommended offers as unavailable or use hotelPage prices', async () => {
  let missing = true;
  const client = createBookingClient({ env: { BOOKING_APP_AUTHORIZATION: 'test', BOOKING_APP_SIGNATURE_SALT: 'test', BOOKING_APP_VERSION: 'test' }, fetchImpl: async url => {
    const data = payload();
    if (new URL(url).pathname.endsWith('mobile.roomList') && missing) { data[0].block = []; data[0].total_blocks = 0; }
    return { ok: true, json: async () => data };
  } });
  await assert.rejects(client.rooms(input), /كل العروض المقترحة/);
  missing = false;
  assert.equal(Object.values(await client.rooms(input))[0].offers.breakfast.price, 2527.90);
});
test('Booking participates in comparison with the right source name and nightly totals', async () => {
  const engine = createLiveScraper(async () => ({ hotelId: '184752', hotelName: 'Al Marwa', baseSlug: 'test' }), async request => normalizeBookingRooms(payload(), request), { source: 'Booking', sourceArabic: 'بوكينج' });
  const result = await executeHotelComparison({ hotelInput: 'booking:184752', checkIn: input.checkIn, checkOut: input.checkOut, sources: ['booking'] }, { booking: engine });
  assert.equal(result.summary.source, 'Booking');
  assert.equal(result.summary.almosaferBreakfast, 2527.90);
  assert.equal(result.data[0].breakfastFlexibleTotalPrice, 2795.36);
  await assert.rejects(executeHotelComparison({ sources: ['booking'] }, { booking: async () => { throw new Error('test failure'); } }), /بوكينج: test failure/);
});

test('A full Booking property link resolves through app-verified linked rooms, never a city destination ID', async () => {
  const requests = [];
  const url = 'https://www.booking.com/hotel/sa/jewar-al-saqefah.ar.html?dest_id=-3092186&dest_type=city&matching_block_id=88951702_269237792_2_2_0&sr_pri_blocks=88951702_269237792_2_2_0__27778';
  const client = {
    hotelDetails: async request => { requests.push(request); return { hotelId: request.hotelId, hotelName: 'Kingsgate Hotel Deyar' }; },
    rooms: async request => { requests.push(request); return { twin: { offers: { breakfast: { roomId: '88951702' } } } }; },
  };
  const hotel = await resolveBookingUrl(url, input, client, { fetchImpl: async () => { throw new Error('HTML is unnecessary'); } });
  assert.equal(hotel.hotelId, '889517'); assert.equal(hotel.identityMethod, 'app-verified-linked-rooms');
  for (const request of requests) { assert.equal(request.hotelId, '889517'); assert.equal(request.checkIn, input.checkIn); assert.deepEqual(request.roomsInfo, input.roomsInfo); }
  client.rooms = async () => ({ other: { offers: { breakfast: { roomId: '99999999' } } } });
  await assert.rejects(resolveBookingUrl(url, input, client), /لم يؤكد التطبيق/);
});

test('Plain Booking property links require unambiguous metadata and app verification; challenges are errors', async () => {
  let calls = 0;
  const client = { hotelDetails: async request => { calls++; return { hotelId: request.hotelId, hotelName: 'Hotel' }; } };
  const url = 'https://www.booking.com/hotel/sa/example.ar.html?sid=private-value';
  const metadata = async requestUrl => { assert.equal(requestUrl, 'https://www.booking.com/hotel/sa/example.ar.html'); return { status: 200, text: async () => 'b_hotel_id = 123456; <div data-hotelid="123456">' }; };
  assert.equal((await resolveBookingUrl(url, input, client, { fetchImpl: metadata })).hotelId, '123456');
  await assert.rejects(resolveBookingUrl(url, input, client, { fetchImpl: async () => ({ status: 202 }) }), /المصدر لم يسمح/);
  await assert.rejects(resolveBookingUrl(url, input, client, { fetchImpl: async () => ({ status: 200, text: async () => 'b_hotel_id=123456; data-hotelid="987654"' }) }), /بدقة/);
  await assert.rejects(resolveBookingUrl('https://booking.com.evil.test/hotel/sa/a.html?matching_block_id=88951702_1_2_2_0', input, client), /رابط صفحة فندق/);
  assert.equal(calls, 1);
});

test('Booking Share and property slugs use the app decoder independently of extra room availability', async () => {
  let calls = 0;
  const client = {
    decodeUrl: async url => {
      calls++; assert.ok(!url.includes('sid='));
      return { dest_type: 'index', dest_id: 12876423, additional_parameters: { dest_type: 'hotel', dest_id: 12876423 }, booking_url: 'booking://searchresults?dest_type=hotel&dest_id=12876423' };
    },
    hotelDetails: async request => {
      assert.equal(request.hotelId, '12876423'); assert.equal(request.checkIn, input.checkIn);
      assert.deepEqual(request.roomsInfo, input.roomsInfo);
      return { hotelId: request.hotelId, hotelName: 'Sama AlMadina Hotel' };
    },
    rooms: async () => { throw new Error('Extra offers cannot decide hotel identity'); },
  };
  for (const url of ['https://www.booking.com/Share-bhNKPOz', 'https://www.booking.com/hotel/sa/fndq-sm-lmdyn-lmdyn-lmnwr.ar.html?sid=private']) {
    assert.equal((await resolveBookingUrl(url, input, client)).identityMethod, 'app-link-decoder');
  }
  assert.equal(calls, 2);
  assert.equal(decodedBookingHotelId({ dest_type: 'city', dest_id: 12876423 }), null);
  assert.equal(decodedBookingHotelId({ dest_type: 'index', dest_id: 12876423 }), null);
  assert.throws(() => decodedBookingHotelId({ dest_type: 'hotel', dest_id: 1, additional_parameters: { dest_type: 'hotel', dest_id: 2 } }), /متعارضة/);
});

test('Hotel identity can be verified by recommended property rooms when extra offers are empty', async () => {
  const client = {
    hotelDetails: async request => ({ hotelId: request.hotelId, hotelName: 'Hotel', linkedRoomIds: ['1287642305'] }),
    rooms: async () => { throw new Error('Extra offers not needed for property identity'); },
  };
  const result = await resolveBookingUrl('https://www.booking.com/hotel/sa/a.html?matching_block_id=1287642305_401714423_2_0_0', input, client);
  assert.equal(result.hotelId, '12876423');
});
