import test from 'node:test';
import assert from 'node:assert/strict';
import { createDailyPricesFetcher } from '../daily-prices-almatar.js';
import { createAlmatarClient, parseAlmatarPackages, toAlmatarPayload } from '../scrapers/almatar-client.js';

const details = { hotelId: '133550', hotelProfileKey: 'mecca-al-marwa-rayhaan-by-rotana-makkah-133550', hotelName: 'المروة ريحان من روتانا', countryCode: 'SA' };
const params = { hotelInput: 'https://almatar.com/ar/hotels/rooms/mecca-al-marwa-rayhaan-by-rotana-makkah-133550/', checkIn: '2026-10-01', checkOut: '2026-10-02', adults: 2, rooms: 1, roomName: 'غرفة واسعة بسرير توأم', bedCount: 2, bedType: 'single', mealPlan: 'breakfast' };
function group(name, offers) { return { name, originalNames: [name], beddingLabel: 'TWIN Bed', beds: [{ options: [{ count: 2, type: 'single' }] }], offers }; }
const offer = (price, packageId) => ({ price, packageId, mealLabel: 'إقامة وإفطار', cancellationPolicy: 'غير قابل للإسترداد' });

test('Daily rates match the exact screenshot room and meal, with cancellation for the base price', async () => {
  const fetcher = createDailyPricesFetcher({ resolveImpl: async () => details, queryImpl: async () => ({
    target: group(params.roomName, { breakfast: offer(1115, 'bb'), breakfastFlexible: offer(1180, 'flex'), halfBoard: offer(1359, 'hb') }),
    view: group('غرفة بسرير توأم مع إطلالة', { breakfast: offer(500, 'other') }),
  }) });
  const result = await fetcher(params);
  assert.equal(result.rows[0].breakfast, '1115.00');
  assert.equal(result.rows[0].dayStatus, 'غير قابل للإسترداد');
  assert.equal(result.rows[0].halfBoard, 'غير متاح');
  assert.equal(result.rows[0].offers.breakfast.packageId, 'bb');
});

test('Missing room does not fall back, failed nights stay unverified, and month ends with checkout November 1', async () => {
  const requested = [];
  const fetcher = createDailyPricesFetcher({ resolveImpl: async () => details, queryImpl: async payload => {
    requested.push(payload);
    if (payload.checkIn === '2026-10-21') throw new Error('network unavailable');
    return { other: group('غرفة بسرير توأم مع إطلالة', { breakfast: offer(500, 'other') }) };
  } });
  const result = await fetcher({ ...params, checkOut: '2026-11-01' });
  assert.equal(result.rows.length, 31);
  assert.equal(result.rows[20].dayStatus, 'تعذر التحقق');
  assert.equal(result.rows[0].dayStatus, 'لا توجد غرفة متاحة');
  assert.ok(result.rows.every(row => row.breakfast === 'غير متاح'));
  assert.ok(requested.some(payload => payload.checkIn === '2026-10-31' && payload.checkOut === '2026-11-01'));
  assert.ok(requested.every(payload => payload.roomsInfo.length === 1 && payload.roomsInfo[0].adultsCount === 2));
});

test('Source coupon is already included: round finalPrice up once', () => {
  const payload = toAlmatarPayload({ ...details, ...params, roomsInfo: [{ adultsCount: 2, kidsAges: [] }] });
  const packet = { data: { searchRoomsResults: [{ packages: [{
    packageId: 'price', almtaarHotelId: 133550, currency: 'SAR', finalPrice: 1114.977,
    originalFinalPrice: 1198.9, isAppliedCouponApplied: true, discountPercentage: 7,
    rooms: [{ roomName: params.roomName, roomBasis: 'إقامة وإفطار', bedType: 'TWIN Bed', adultsCount: 2, kidsAges: [] }],
  }] }] } };
  const result = Object.values(parseAlmatarPackages([packet], payload))[0];
  assert.equal(result.offers.breakfast.price, 1115);
  assert.equal(result.offers.breakfast.sourceTotalPrice, 1114.977);
});

test('Incomplete packages with no polling session cannot be reported as verified prices', async () => {
  const payload = { ...details, ...params, roomsInfo: [{ adultsCount: 2, kidsAges: [] }] };
  const client = createAlmatarClient({ sleep: async () => {}, fetchImpl: async () => ({ ok: true, json: async () => ({ data: {
    req: toAlmatarPayload(payload).req, searchRoomsResults: [], isSearchCompleted: false,
  } }) }) });
  await assert.rejects(client(payload, { maxAttempts: 1 }), /لم يكتمل/);
});
