// Run separately: node tests/daily-jobs-http.test.js. The upstream mock must be
// installed before importing server.js and its default source clients.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('The daily HTTP route acknowledges early, survives a lost response and retains source offers and requested dates', async () => {
  const nativeFetch = globalThis.fetch, originalPort = process.env.PORT;
  const fixture = JSON.parse(await readFile(new URL('fixtures/almatar-day.json', import.meta.url), 'utf8'));
  let releaseSource, sourceCalls = 0, server;
  const pendingSource = new Promise(resolve => { releaseSource = resolve; });
  process.env.PORT = '0';
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('http://127.0.0.1:')) return nativeFetch(url, options);
    assert.ok(String(url).startsWith('https://almatar.com/'), 'No requests to other external services in this regression test');
    if (url.includes('hotelbyprofilekey')) return Response.json({ data: { almHotelCode: '1660326', hotelBasicData: { name: 'Test hotel', countryCode: 'SA' } } });
    sourceCalls++;
    await pendingSource;
    return Response.json(fixture);
  };
  try {
    ({ server } = await import('../server.js'));
    if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
    const api = `http://127.0.0.1:${server.address().port}/api`;
    const input = {
      background: true, hotelInput: 'https://almatar.com/ar/hotels/rooms/mecca-m-hotel-al-dana-makkah-millennium-1660326/',
      checkIn: '2026-10-01', checkOut: '2026-10-02', adults: 2, rooms: 1,
      roomName: 'غرفة ستاندرد توأم', mealPlan: 'breakfast', bedCount: 2, bedType: 'single',
    };
    const submit = () => nativeFetch(`${api}/daily-prices`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(3000) });
    // Discard the first response body to simulate the browser losing it.
    const first = await submit();
    assert.equal(first.status, 202);
    await first.body.cancel();
    const retry = await submit();
    assert.equal(retry.status, 202);
    const { jobId } = await retry.json();
    let poll = await nativeFetch(`${api}/search-jobs/${jobId}`);
    assert.equal(poll.headers.get('cache-control'), 'no-store');
    assert.equal((await poll.json()).status, 'running');
    releaseSource();
    let state;
    for (let attempt = 0; attempt < 50; attempt++) {
      state = await (await nativeFetch(`${api}/search-jobs/${jobId}`)).json();
      if (state.status !== 'running') break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(state.status, 'completed');
    assert.equal(sourceCalls, 1, 'The lost response must not duplicate source scraping');
    assert.equal(state.progress.percent, 100);
    assert.equal(state.result.success, true);
    assert.equal(state.result.roomName, input.roomName);
    assert.equal(state.result.rows.length, 1);
    const row = state.result.rows[0];
    assert.equal(row.roomOnly, 'غير متاح');
    assert.notEqual(row.breakfast, 'غير متاح');
    assert.ok(row.offers.breakfast.packageId);
    assert.equal(row.date, input.checkIn);
    assert.equal(row.nextDate, input.checkOut);
    const sourcePackage = fixture.data.searchRoomsResults.flatMap(group => [group.defaultPackage, ...(group.packages || [])])
      .find(pkg => pkg?.packageId === row.offers.breakfast.packageId);
    assert.ok(sourcePackage);
    assert.equal(row.offers.breakfast.price, Math.ceil(sourcePackage.finalPrice));
    const invalid = await nativeFetch(`${api}/daily-prices`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, checkOut: input.checkIn }) });
    assert.equal(invalid.status, 400);
    assert.equal(sourceCalls, 1);
    const roomInput = { ...input, source: 'almatar', refresh: true, checkOut: '2026-11-01' };
    const roomSubmit = () => nativeFetch(`${api}/hotel-rooms-list`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roomInput), signal: AbortSignal.timeout(3000) });
    const firstRoom = await roomSubmit();
    assert.equal(firstRoom.status, 202);
    const roomJob = await firstRoom.json();
    assert.equal((await (await roomSubmit()).json()).jobId, roomJob.jobId);
    let roomState;
    for (let attempt = 0; attempt < 50; attempt++) {
      roomState = await (await nativeFetch(`${api}/search-jobs/${roomJob.jobId}`)).json();
      if (roomState.status !== 'running') break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(roomState.status, 'completed');
    assert.ok(roomState.result.rooms.length > 0);
    assert.equal(roomState.result.hotelId, '1660326');
    assert.equal(roomState.result.checkOut, '2026-10-02', 'Room loading uses the requested FIRST night');
    assert.equal(sourceCalls, 2, 'Duplicate room submissions share the same execution');
    const invalidRoom = await nativeFetch(`${api}/hotel-rooms-list`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...roomInput, checkIn: 'invalid-date' }) });
    assert.equal(invalidRoom.status, 400);
  } finally {
    releaseSource();
    globalThis.fetch = nativeFetch;
    if (originalPort === undefined) delete process.env.PORT; else process.env.PORT = originalPort;
    if (server) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  }
});
