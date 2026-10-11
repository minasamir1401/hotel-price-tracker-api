import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingHotelId, normalizeBookingRooms, createBookingClient } from '../scrapers/booking-client.js';
import { createLiveScraper } from '../scrapers/almosafer-live.js';
import { executeHotelComparison } from '../scrapers/index.js';

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
  await client.rooms(input); await client.rooms(input); assert.equal(calls, 2);
});
test('Booking participates in comparison with the right source name and nightly totals', async () => {
  const engine = createLiveScraper(async () => ({ hotelId: '184752', hotelName: 'Al Marwa', baseSlug: 'test' }), async request => normalizeBookingRooms(payload(), request), { source: 'Booking', sourceArabic: 'بوكينج' });
  const result = await executeHotelComparison({ hotelInput: 'booking:184752', checkIn: input.checkIn, checkOut: input.checkOut, sources: ['booking'] }, { booking: engine });
  assert.equal(result.summary.source, 'Booking');
  assert.equal(result.summary.almosaferBreakfast, 2527.90);
  assert.equal(result.data[0].breakfastFlexibleTotalPrice, 2795.36);
  await assert.rejects(executeHotelComparison({ sources: ['booking'] }, { booking: async () => { throw new Error('test failure'); } }), /بوكينج: test failure/);
});
