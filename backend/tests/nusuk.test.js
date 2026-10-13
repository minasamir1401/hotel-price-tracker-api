import test from 'node:test';
import assert from 'node:assert/strict';
import { createNusukClient, normalizeNusukRooms, toNusukRequest } from '../scrapers/nusuk-client.js';
import { nusukProfileKey, createNusukResolver } from '../scrapers/nusuk.js';
import { createLiveScraper } from '../scrapers/almosafer-live.js';
import { createHotelRoomsService, detectHotelSource } from '../hotel-rooms-service.js';
import { createSearchJobs } from '../search-jobs.js';

const input = { hotelId: '1660326', hotelProfileKey: 'mecca-test-hotel-1660326', countryCode: 'SA', checkIn: '2026-10-20', checkOut: '2026-10-21', roomsInfo: [{ adultsCount: 2, kidsAges: [] }] };
const hotel = { data: { almHotelCode: 1660326, almHotelProfileKey: input.hotelProfileKey, hotelBasicData: { name: 'Test hotel', countryCode: 'SA', cityName: 'مكة المكرمة' } } };
const packet = () => ({ data: { req: { cy: 'SAR', fd: 1792454400, td: 1792540800, rs: [{ ac: '2', cc: '0', ka: [] }] }, isSearchCompleted: true, hotelIsAvailable: true, sum: { hn: 'Test hotel' }, searchRoomsResults: [{ packages: [{ packageId: 'quote-1', almtaarHotelId: 1660326, currency: 'SAR', finalPrice: 114.24, originalFinalPrice: 114.24, finalTax: 0, isRefundable: false, rooms: [{ roomName: 'Standard', rateId: 'rate-1', adultsCount: 2, kidsAges: [], currency: 'SAR', finalPrice: 114.24, roomBasis: 'إقامة فقط', bedType: 'KING BED' }] }] }] } });
const reply = body => ({ ok: true, status: 200, json: async () => structuredClone(body) });

test('Nusuk identity accepts property keys and rejects unverified names and lookalike domains', () => {
  assert.equal(nusukProfileKey(`nusuk:${input.hotelProfileKey}`), input.hotelProfileKey);
  assert.equal(nusukProfileKey(`https://almatar.com/ar/hotels/rooms/${input.hotelProfileKey}/`), input.hotelProfileKey);
  assert.equal(detectHotelSource(`nusuk:${input.hotelProfileKey}`), 'nusuk');
  assert.equal(detectHotelSource(`https://nusuk.almatar.com/ar/hotels/rooms/${input.hotelProfileKey}/`), 'nusuk');
  const apiUrl = 'https://apiout.almatar.com/ar/hotels/rooms/jeddah-intercontinental-jeddah-ihg-hotel-133244';
  assert.equal(nusukProfileKey(apiUrl), 'jeddah-intercontinental-jeddah-ihg-hotel-133244');
  assert.equal(detectHotelSource(apiUrl), 'nusuk');
  assert.equal(detectHotelSource(`https://almatar.com/ar/hotels/rooms/${input.hotelProfileKey}`), 'almatar');
  for (const value of ['Hotel name', 'nusuk:1660326', `https://almatar.com.evil.test/ar/hotels/rooms/${input.hotelProfileKey}/`, `https://apiout.almatar.com.evil.test/ar/hotels/rooms/${input.hotelProfileKey}/`]) assert.throws(() => nusukProfileKey(value));
});
test('Nusuk applies the Android float/ceil display rule once and keeps the exact receipt', () => {
  const rooms = normalizeNusukRooms(packet(), input, { hotelName: 'Test hotel' });
  const room = Object.values(rooms)[0], quote = room.offers.roomOnly;
  assert.equal(quote.price, 115);
  assert.equal(quote.sourceTotalPrice, 114.24);
  assert.equal(quote.packageId, 'quote-1');
  assert.equal(quote.roomId, 'rate-1');
  assert.equal(quote.taxBreakdown, null);
  assert.equal(quote.screenPriceVerified, false);
  assert.equal(room.beds[0].options[0].type, 'king');
  assert.equal(room.offers.breakfast, undefined);
});
test('Nusuk rejects wrong hotel, dates, occupancy, currency, prices and incomplete source responses', () => {
  const mutations = [
    data => { data.data.req.fd += 86400; },
    data => { data.data.req.rs[0].ac = '1'; },
    data => { data.data.req.cy = 'USD'; },
    data => { data.data.isSearchCompleted = false; },
    data => { data.data.searchRoomsResults[0].packages[0].almtaarHotelId = 123; },
    data => { data.data.searchRoomsResults[0].packages[0].rooms[0].adultsCount = 1; },
    data => { data.data.searchRoomsResults[0].packages[0].finalPrice = 0; },
    data => { delete data.data.searchRoomsResults[0].packages[0].rooms[0].roomName; },
    data => { delete data.data.searchRoomsResults[0].packages[0].isRefundable; },
    data => { data.data.sum.hn = 'Other hotel'; },
  ];
  for (const mutate of mutations) { const value = packet(); mutate(value); assert.throws(() => normalizeNusukRooms(value, input, { hotelName: 'Test hotel' })); }
});
test('Nusuk distinguishes verified sold-out from empty or malformed replies', () => {
  const value = packet(); value.data.searchRoomsResults = [];
  assert.throws(() => normalizeNusukRooms(value, input, { hotelName: 'Test hotel' }));
  value.data.hotelIsAvailable = false;
  assert.deepEqual(normalizeNusukRooms(value, input, { hotelName: 'Test hotel' }), {});
  delete value.data.sum;
  assert.throws(() => normalizeNusukRooms(value, input, { hotelName: 'Test hotel' }));
});
test('Nusuk does not relabel full board as half board or accept contradictory duplicate offers', () => {
  const value = packet(); value.data.searchRoomsResults[0].packages[0].rooms[0].roomBasis = 'Full board';
  assert.deepEqual(normalizeNusukRooms(value, input), {});
  const duplicate = packet();
  const offer = structuredClone(duplicate.data.searchRoomsResults[0].packages[0]);
  offer.finalPrice = 200; offer.rooms[0].finalPrice = 200;
  duplicate.data.searchRoomsResults[0].packages.push(offer);
  assert.throws(() => normalizeNusukRooms(duplicate, input), /متضاربة/);
});
test('Nusuk blocks children and multi-room searches before sending a price request', () => {
  assert.throws(() => toNusukRequest({ ...input, roomsInfo: [input.roomsInfo[0], input.roomsInfo[0]] }), /غرفة واحدة/);
  assert.throws(() => toNusukRequest({ ...input, roomsInfo: [{ adultsCount: 2, kidsAges: [5] }] }), /بدون أطفال/);
});
test('Nusuk polls the native queue schema, refreshes successful results and never caches failures', async () => {
  let prices = 0, polls = 0, failed = false;
  const client = createNusukClient({ sleep: async () => {}, fetchImpl: async (url, options) => {
    assert(url.startsWith('https://apiout.almatar.com/'));
    assert.equal(options.headers.Platform, 'android');
    assert.equal(options.headers.Authorization, undefined);
    if (url.includes('hotelbyprofilekey')) return reply(hotel);
    if (url.includes('search_with_session_id')) {
      polls++;
      assert.deepEqual(JSON.parse(options.body), { almHotelId: 1660326, queueSessionId: 'queue' });
      return reply(packet());
    }
    prices++;
    if (failed) throw new Error('Network failed');
    assert.deepEqual(JSON.parse(options.body), { hotelId: 1660326, multiRoomMode: true, countryCode: 'SA', req: { cy: 'SAR', fd: '10/20/2026', td: '10/21/2026', rs: [{ ac: 2, cc: 0, ka: [] }] } });
    const value = packet(); value.data.isSearchCompleted = false; value.data.searchRoomsResults = []; value.data.sd = 'queue';
    return reply(value);
  } });
  await client.rooms(input); await client.rooms(input);
  assert.equal(prices, 1); assert.equal(polls, 1);
  await client.rooms(input, { refresh: true }); assert.equal(prices, 2);
  failed = true;
  await assert.rejects(client.rooms(input, { refresh: true }), /Network failed/);
  let attempts = 0;
  const recovery = createNusukClient({ fetchImpl: async url => {
    if (url.includes('hotelbyprofilekey')) return reply(hotel);
    attempts++;
    if (attempts === 1) throw new Error('Network failed');
    return reply(packet());
  } });
  await assert.rejects(recovery.rooms(input), /Network failed/);
  await recovery.rooms(input); await recovery.rooms(input);
  assert.equal(attempts, 2);
});
test('Nusuk room selection accepts an Almatar identity URL while keeping the Nusuk engine', async () => {
  const client = createNusukClient({ fetchImpl: async url => reply(url.includes('hotelbyprofilekey') ? hotel : packet()) });
  const service = createHotelRoomsService({ resolveNusuk: createNusukResolver(client), nusukClient: client });
  const value = await service({ hotelInput: `https://almatar.com/ar/hotels/rooms/${input.hotelProfileKey}/`, source: 'nusuk', adults: 2, rooms: 1, childAges: [], checkIn: input.checkIn });
  assert.equal(value.source, 'nusuk'); assert.deepEqual(value.rooms, ['Standard']);
  const detected = await service({ hotelInput: `https://apiout.almatar.com/ar/hotels/rooms/${input.hotelProfileKey}`, adults: 2, rooms: 1, childAges: [], checkIn: input.checkIn });
  assert.equal(detected.source, 'nusuk'); assert.deepEqual(detected.rooms, ['Standard']);
});
test('Nusuk background jobs accept the new source and retain its result', async () => {
  const jobs = createSearchJobs({ execute: async params => ({ success: true, source: params.sources[0] }) });
  const job = jobs.start({ hotelInput: `nusuk:${input.hotelProfileKey}`, sources: ['nusuk'], checkIn: input.checkIn, checkOut: input.checkOut });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(jobs.get(job.id).status, 'completed');
  assert.equal(jobs.get(job.id).result.source, 'nusuk');
});
test('Nusuk accepts verified Saudi hotels in Jeddah and still rejects a different country', async () => {
  const other = structuredClone(hotel); other.data.hotelBasicData.cityName = 'جدة';
  const client = createNusukClient({ fetchImpl: async () => reply(other) });
  assert.equal((await client.hotel(input.hotelProfileKey)).hotelId, input.hotelId);
  other.data.hotelBasicData.countryCode = 'AE';
  const foreign = createNusukClient({ fetchImpl: async () => reply(other) });
  await assert.rejects(foreign.hotel(input.hotelProfileKey), /السعودية/);
});
test('Nusuk never copies a same-named room with different beds into another night', async () => {
  const scraper = createLiveScraper(async () => ({ hotelId: input.hotelId, hotelName: 'Test hotel', baseSlug: 'test' }), async ({ checkIn }) => {
    const beds = checkIn.endsWith('20') ? 'KING' : 'TWIN';
    return { [beds]: { name: 'Standard', category: 'Standard', beds: [], offers: { roomOnly: { price: 115, packageId: beds } } } };
  }, { source: 'Nusuk', allowSameNameFallback: false });
  const rooms = await scraper({ hotelInput: 'test', checkIn: '2026-10-20', checkOut: '2026-10-22', adults: 2, rooms: 1 });
  for (const room of rooms) { assert.equal(room.roomOnlyAvailableNights, 1); assert.equal(room.roomOnlyTotalPrice, null); }
});
