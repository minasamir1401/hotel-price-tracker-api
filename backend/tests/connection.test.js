import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnigmaClient } from '../scrapers/enigma.js';
import { createAlmosaferSessionProvider } from '../scrapers/almosafer-session.js';
import { createHotelRoomsService, detectHotelSource } from '../hotel-rooms-service.js';
import { upstreamHttpError, UpstreamError } from '../scrapers/upstream-error.js';
import { sourceSnapshot, recordSourceSuccess, recordSourceFailure } from '../scrapers/source-status.js';

const payload = { hotelId: '1287944', checkIn: '2026-10-11', checkOut: '2026-10-12', currency: 'SAR', roomsInfo: [{ adultsCount: 2, kidsAges: [] }] };
const body = { hotelInput: 'https://www.almosafer.com/ar/hotel/details/atg/hotel-1287944', checkIn: payload.checkIn, adults: 2, rooms: 1, childAges: [] };
const sessionPage = token => ({ ok: true, headers: { getSetCookie: () => ['session=private-cookie; Secure; HttpOnly'] }, text: async () => `<script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: { APIToken: token } } })}</script>` });

test('An explicitly configured rejected token recovers with a fresh session and its cookies', async () => {
  let starts = 0, bootstraps = 0;
  const client = createEnigmaClient({ token: 'obsolete-test-token', sleep: async () => {}, fetchImpl: async (url, options) => {
    if (!url.includes('/api/')) { bootstraps++; return sessionPage('fresh-test-token'); }
    if (options.headers.token === 'obsolete-test-token') return { ok: false, status: 403 };
    assert.equal(options.headers.token, 'fresh-test-token'); assert.equal(options.headers.Cookie, 'session=private-cookie');
    if (!url.includes('/poll/')) { starts++; return { ok: true, json: async () => ({ pId: 'valid', hotelId: '1287944' }) }; }
    return { ok: true, json: async () => ({ hotelId: '1287944', currencyCode: 'SAR', numberOfNights: 1, pollingStatus: 'COMPLETED_SUCCESSFULLY', packagesGroups: [] }) };
  } });
  assert.deepEqual(await client(payload), {}); assert.equal(bootstraps, 1); assert.equal(starts, 1);
});
test('Blocked bootstrap preserves diagnostic identity, never attempts package requests and is not cached as availability', async () => {
  let requests = 0;
  const session = createAlmosaferSessionProvider({ fetchImpl: async () => { requests++; return { ok: false, status: 403, text: async () => '<html>CloudFront Request blocked.</html>' }; } });
  const client = createEnigmaClient({ sessionProvider: session, sleep: async () => {}, fetchImpl: async () => { throw new Error('Prices must not be called'); } });
  await assert.rejects(client(payload), error => error.upstreamStatus === 403 && error.stage === 'session-bootstrap' && Boolean(error.diagnosticId));
  await assert.rejects(client(payload), /HTTP 403/); assert.equal(requests, 2);
});
test('Safe upstream diagnostics expose structural evidence without body credentials or query strings', async () => {
  const logs = [];
  const error = await upstreamHttpError({ status: 403, headers: { get: key => ({ 'server': 'CloudFront', 'set-cookie': 'private-cookie' })[key] }, text: async () => '<html>Request blocked. secret-token private-cookie</html>' }, { stage: 'packages', url: 'https://www.almosafer.com/api/enigma/v7/packages?token=secret-token', logger: (...args) => logs.push(args.join(' ')) });
  assert.equal(error.upstreamStatus, 403); assert.ok(error.diagnosticId);
  assert.ok(logs[0].includes('access-denied')); assert.ok(!logs[0].includes('secret-token')); assert.ok(!logs[0].includes('private-cookie'));
});
test('Room selector uses the exact first night, all requested rooms and child ages; concurrent duplicates share one request', async () => {
  const requests = [];
  const service = createHotelRoomsService({ resolveAlmosafer: async () => ({ hotelId: '1287944', hotelName: 'Hotel' }), enigmaClient: async request => { requests.push(request); await Promise.resolve(); return { one: { name: 'Twin' } }; } });
  const request = { ...body, rooms: 2, children: 1, childAges: [7] };
  const results = await Promise.all([service(request), service(request)]);
  assert.equal(requests.length, 1); assert.equal(results[0].checkIn, '2026-10-11'); assert.equal(results[0].checkOut, '2026-10-12');
  assert.deepEqual(requests[0].roomsInfo, [{ adultsCount: 2, kidsAges: [7] }, { adultsCount: 2, kidsAges: [7] }]);
  await service(request); assert.equal(requests.length, 1);
  await service({ ...request, refresh: true }); assert.equal(requests.length, 2);
});
test('A failed room selector never silently queries later dates or caches the failure', async () => {
  let calls = 0, failed = true;
  const service = createHotelRoomsService({ resolveAlmosafer: async () => ({ hotelId: '1287944' }), enigmaClient: async request => {
    calls++; assert.equal(request.checkIn, payload.checkIn);
    if (failed) throw new UpstreamError('المسافر HTTP 403', { source: 'almosafer', status: 403 });
    return {};
  } });
  await assert.rejects(service(body), /403/); assert.equal(calls, 1);
  failed = false; const result = await service(body); assert.deepEqual(result.rooms, []); assert.equal(calls, 2);
});
test('Room selector rejects invalid dates, source mismatches and children without ages before requesting prices', async () => {
  const service = createHotelRoomsService({ resolveAlmosafer: async () => { throw new Error('must not query'); } });
  for (const change of [{ checkIn: '2026-02-30' }, { rooms: 0 }, { adults: 0 }, { children: 1 }, { source: 'booking' }]) await assert.rejects(service({ ...body, ...change }), error => error.status === 400);
  assert.equal(detectHotelSource('https://almosafer.com.evil.test/'), null);
});
test('Source readiness reflects successful price requests, refusals and untested providers', () => {
  assert.equal(sourceSnapshot('new-test-provider').status, 'unchecked');
  recordSourceSuccess('status-test'); assert.equal(sourceSnapshot('status-test').status, 'ready');
  recordSourceFailure('status-test', new UpstreamError('denied', { status: 403 })); assert.equal(sourceSnapshot('status-test').status, 'blocked');
  assert.equal(sourceSnapshot('status-test', false).status, 'offline');
});
