import test from 'node:test';
import assert from 'node:assert/strict';
import { createHotelRoomsService } from '../hotel-rooms-service.js';
import { createLiveScraper } from '../scrapers/almosafer-live.js';
import { createRoomInventoryStore } from '../room-inventory.js';
import { forEachNight } from '../scrapers/night-workers.js';
import { createEnigmaClient } from '../scrapers/enigma.js';

const details = { hotelId: '3999319', hotelName: 'الريادة جراند', baseSlug: 'hotel/details/atg/hotel-3999319' };
const input = { hotelInput: 'https://www.almosafer.com/ar/hotel/details/atg/hotel-3999319',
  source: 'almosafer', checkIn: '2027-02-01', checkOut: '2027-03-04', adults: 2, rooms: 1, children: 0, childAges: [] };
const room = (name, date, price = 159) => ({ name, beds: [{ options: [{ count: 1, type: 'king' }] }],
  offers: { roomOnly: { price, packageId: `${name}-${date}` } } });

test('The full 31-night selector discovers a room absent on the first night, with exact dates and occupancy', async () => {
  const calls = [], progress = [], inventoryStore = createRoomInventoryStore();
  const query = async request => {
    calls.push(request);
    if (request.checkIn === input.checkIn) return {};
    const triple = room('غرفة ثلاثية', request.checkIn);
    return { triple, ...(request.checkIn === '2027-02-04' ? { classic: room('غرفة كلاسيك', request.checkIn) } : {}) };
  };
  const service = createHotelRoomsService({ resolveAlmosafer: async () => details, enigmaClient: query, inventoryStore });
  const result = await service({ ...input, onProgress: p => progress.push(p) });
  assert.equal(calls.length, 31, 'Confirmed sold-out first night is not scraped again');
  assert.equal(new Set(calls.map(c => c.checkIn)).size, 31);
  assert.ok(calls.every(c => c.checkOut > c.checkIn && c.roomsInfo.length === 1 && c.roomsInfo[0].adultsCount === 2));
  const triple = result.roomAvailability.find(r => r.name === 'غرفة ثلاثية');
  assert.equal(triple.availableNights, 30);
  assert.equal(triple.totalNights, 31);
  assert.equal(triple.availableDates[0], '2027-02-02');
  assert.equal(triple.availableDates.at(-1), '2027-03-03');
  assert.deepEqual(result.roomAvailability.find(r => r.name === 'غرفة كلاسيك').availableDates, ['2027-02-04']);
  assert.equal(result.checkOut, input.checkOut);
  assert.equal(progress.at(-1).percent, 100);

  const scrape = createLiveScraper(async () => assert.fail('The next search reuses the same lookup'),
    async () => assert.fail('No second monthly scrape'), { inventoryStore });
  const results = await scrape({ ...input, roomInventoryId: result.roomInventoryId, bedCount: 1, bedType: 'king', refresh: true });
  const selected = results.find(r => r.roomName === 'غرفة ثلاثية');
  assert.equal(selected.bedFilterStatus, 'matched');
  assert.equal(selected.dailyRates[0].availability, 'unavailable');
  assert.equal(selected.dailyRates[1].offers.roomOnly.packageId, 'غرفة ثلاثية-2027-02-02');
  assert.equal(selected.roomOnlyTotalPrice, null, 'A partial month cannot have a full-stay direct total');
  assert.equal(inventoryStore.take(result.roomInventoryId, input), null, 'Reuse is consumed once, so another search refreshes prices');
});

test('Alternative dates in discovery are direct room dates, never dates filled by a different room', async () => {
  const params = { ...input, checkOut: '2027-02-04' };
  const service = createHotelRoomsService({ resolveAlmosafer: async () => details, enigmaClient: async request =>
    request.checkIn === input.checkIn ? { classic: room('كلاسيك', request.checkIn) } : { triple: room('ثلاثية', request.checkIn) } });
  const result = await service(params);
  assert.deepEqual(result.roomAvailability.find(r => r.name === 'ثلاثية').availableDates, ['2027-02-02', '2027-02-03']);
  assert.deepEqual(result.roomAvailability.find(r => r.name === 'كلاسيك').availableDates, ['2027-02-01']);
});

test('Inventory reuse rejects a different hotel, dates or occupancy, expires, and cannot suppress bed filtering', async () => {
  let time = 0;
  const store = createRoomInventoryStore({ now: () => time, ttlMs: 100 });
  const id = store.put(input, [{ beds: [], name: 'Unknown' }]);
  for (const change of [{ hotelInput: input.hotelInput.replace('www.', 'global.') }, { checkOut: '2027-03-03' },
    { checkIn: '2027-02-02' }, { adults: 3 }, { rooms: 2 }, { children: 1, childAges: [7] }]) {
    assert.equal(store.take(id, { ...input, ...change }), null);
  }
  time = 101;
  assert.equal(store.take(id, input), null);
  const service = createHotelRoomsService({ resolveAlmosafer: async () => details, enigmaClient: async p => ({ king: room('King', p.checkIn) }), inventoryStore: store });
  const params = { ...input, checkOut: '2027-02-02' };
  const discovered = await service(params);
  const scrape = createLiveScraper(async () => assert.fail('No resolver'), async () => assert.fail('No source calls'), { inventoryStore: store });
  const results = await scrape({ ...params, roomInventoryId: discovered.roomInventoryId, bedCount: 3, bedType: 'single' });
  assert.equal(results.length, 0);
  assert.ok(results.filterWarnings.length);
});

test('A failed date stays unverified on reuse, while partial catalogs are not cached as complete', async () => {
  const calls = [], progress = [], inventoryStore = createRoomInventoryStore();
  const service = createHotelRoomsService({ resolveAlmosafer: async () => details, enigmaClient: async p => {
    calls.push(p.checkIn);
    if (p.checkIn === '2027-02-02') throw new Error('Incomplete poll');
    return { classic: room('كلاسيك', p.checkIn) };
  }, inventoryStore });
  const params = { ...input, checkOut: '2027-02-04' };
  const result = await service({ ...params, onProgress: p => progress.push(p) });
  assert.deepEqual(result.warnings.map(w => w.date), ['2027-02-02']);
  assert.ok(result.roomInventoryId);
  assert.deepEqual(result.roomAvailability[0].availableDates, ['2027-02-01', '2027-02-03']);
  assert.ok(!progress.some(p => p.phase === 'repairing'), 'Discovery must not wait on a second monthly pass');
  assert.equal(progress.at(-1).phase, 'completed');
  const scrape = createLiveScraper(async () => assert.fail('No repeated month lookup'), async () => assert.fail('Successful and repaired nights are reused'), { inventoryStore });
  const reused = await scrape({ ...params, roomInventoryId: result.roomInventoryId });
  assert.equal(reused[0].dailyRates[1].availability, 'error');
  assert.match(reused[0].dailyRates[1].error, /Incomplete poll/);
  assert.equal(reused[0].dailyRates[1].roomOnlyPrice, null);
  await service(params);
  assert.equal(calls.length, 6, 'Each discovery fetches three nights without waiting on automatic retries');
});

test('A direct price scan repairs a failed night once and reports a separate repair phase', async () => {
  const attempts = new Map(), progress = [];
  const scrape = createLiveScraper(async () => details, async (p, options) => {
    const count = (attempts.get(p.checkIn) || 0) + 1;
    attempts.set(p.checkIn, count);
    assert.equal(options.maxAttempts, 1);
    if (p.checkIn === '2027-02-02' && count === 1) throw new Error('Temporary failure');
    return { classic: room('Classic', p.checkIn) };
  });
  const result = await scrape({ ...input, checkOut: '2027-02-04', onProgress: p => progress.push(p) });
  assert.equal(attempts.get('2027-02-02'), 2);
  assert.ok(progress.some(p => p.phase === 'repairing' && p.repairCompleted === 0 && p.repairTotal === 1 && p.percent === 0));
  assert.equal(progress.at(-1).phase, 'completed');
  assert.equal(result[0].roomOnlyAvailableNights, 3);
});

test('Almatar discovery also returns the union across the selected dates and preserves all rooms and children', async () => {
  const calls = [];
  const service = createHotelRoomsService({ resolveAlmatar: async () => ({ ...details, hotelProfileKey: 'hotel-3999319' }), fetchOneNight: async p => {
    calls.push(p);
    return { rooms: p.checkIn === input.checkIn ? [] : [{ roomName: 'Triple' }] };
  } });
  const result = await service({ ...input, source: 'almatar', hotelInput: 'https://almatar.com/ar/hotels/rooms/hotel-3999319',
    checkOut: '2027-02-04', rooms: 2, children: 1, childAges: [7] });
  assert.equal(calls.length, 3);
  assert.ok(calls.every(p => p.rooms === 2 && p.childAges[0] === 7));
  assert.deepEqual(result.roomAvailability[0].availableDates, ['2027-02-02', '2027-02-03']);
});

test('Workers fill free slots while a slow first night is still pending and respect the concurrency cap', async () => {
  let releaseFirst, completedLater;
  const slow = new Promise(resolve => { releaseFirst = resolve; });
  const laterDone = new Promise(resolve => { completedLater = resolve; });
  let active = 0, maxActive = 0;
  const completed = [];
  const work = forEachNight([0, 1, 2, 3], 2, async value => {
    maxActive = Math.max(maxActive, ++active);
    if (value === 0) await slow;
    completed.push(value); active--;
    if (value === 3) completedLater();
  });
  try {
    await laterDone;
    assert.deepEqual(completed, [1, 2, 3]);
    assert.equal(maxActive, 2);
  } finally { releaseFirst(); await work; }
});

test('A verified empty final poll uses one search even with the default retry budget', async () => {
  let starts = 0, polls = 0;
  const client = createEnigmaClient({ token: 'test', sleep: async () => {}, fetchImpl: async url => {
    if (!url.includes('/poll/')) { starts++; return Response.json({ pId: 'verified', hotelId: details.hotelId }); }
    polls++;
    return Response.json({ hotelId: details.hotelId, currencyCode: 'SAR', numberOfNights: 1,
      pollingStatus: 'COMPLETED_SUCCESSFULLY', packagesGroups: [] });
  } });
  assert.deepEqual(await client({ hotelId: details.hotelId, roomsInfo: [{ adultsCount: 2, kidsAges: [] }] }), {});
  assert.equal(starts, 1); assert.equal(polls, 1);
});
