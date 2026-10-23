// Run separately: installs the source mock before loading the HTTP server.
import test from 'node:test';
import assert from 'node:assert/strict';

test('The HTTP room catalog discovers later dates and the following price job reuses all 31 verified nightly quotes', async () => {
  const nativeFetch = globalThis.fetch;
  const savedEnv = Object.fromEntries(['PORT', 'ALMOSAFER_HTTP_TRANSPORT', 'ALMOSAFER_API_TOKEN'].map(key => [key, process.env[key]]));
  const searches = new Map();
  let server, starts = 0, polls = 0;
  process.env.PORT = '0';
  process.env.ALMOSAFER_HTTP_TRANSPORT = 'native';
  process.env.ALMOSAFER_API_TOKEN = 'test-public-web-token';
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith('http://127.0.0.1:')) return nativeFetch(url, options);
    assert.equal(new URL(url).hostname, 'www.almosafer.com');
    if (options.method === 'PUT') {
      const payload = JSON.parse(options.body);
      assert.equal(payload.hotelId, '3999319');
      assert.deepEqual(payload.roomsInfo, [{ adultsCount: 2, kidsAges: [] }]);
      searches.set(payload.checkIn, payload);
      starts++;
      return Response.json({ pId: payload.checkIn, hotelId: payload.hotelId, initialDelayInMillis: 1 });
    }
    const date = String(url).split('/').at(-1), payload = searches.get(date);
    assert.ok(payload);
    polls++;
    const name = date === '2027-02-01' ? 'غرفة كلاسيك' : 'غرفة ثلاثية';
    return Response.json({ hotelId: payload.hotelId, currencyCode: 'SAR', numberOfNights: 1,
      pollingStatus: 'COMPLETED_SUCCESSFULLY', packagesGroups: [{ title: { ar: name }, packages: [{
        bookable: true, packageId: `real-quote-${date}`, packageRateInfo: { total: 159, currency: 'SAR' },
        rooms: [{ roomName: { ar: name }, roomBasis: 'RO', bedding: date === '2027-02-01' ? '1 King Bed' : '3 Single Beds' }],
      }] }] });
  };
  try {
    ({ server } = await import('../server.js'));
    if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
    const api = `http://127.0.0.1:${server.address().port}/api`;
    const post = async (endpoint, input) => {
      const response = await nativeFetch(`${api}/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      assert.equal(response.status, 202);
      return response.json();
    };
    const finish = async jobId => {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const state = await (await nativeFetch(`${api}/search-jobs/${jobId}`)).json();
        if (state.status !== 'running') { assert.equal(state.status, 'completed', JSON.stringify(state.error)); return state; }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.fail('Monthly fixture job timed out');
    };
    const input = { background: true, source: 'almosafer', sources: ['almosafer'], refresh: true,
      hotelInput: 'https://www.almosafer.com/ar/hotel/details/atg/الريادة-جراند-3999319',
      checkIn: '2027-02-01', checkOut: '2027-03-04', adults: 2, rooms: 1, children: 0, childAges: [] };
    const job = await post('hotel-rooms-list', input);
    assert.equal((await post('hotel-rooms-list', input)).jobId, job.jobId);
    const catalogState = await finish(job.jobId), catalog = catalogState.result;
    assert.equal(catalogState.progress.total, 31);
    assert.equal(catalog.checkOut, input.checkOut);
    assert.ok(catalog.rooms.includes('غرفة ثلاثية'));
    const triple = catalog.roomAvailability.find(r => r.name === 'غرفة ثلاثية');
    assert.equal(triple.availableNights, 30);
    assert.equal(triple.availableDates[0], '2027-02-02');
    assert.equal(triple.availableDates.at(-1), '2027-03-03');
    assert.equal(starts, 31); assert.equal(polls, 31);
    const priceJob = await post('search-hotel-prices', { ...input, roomInventoryId: catalog.roomInventoryId });
    const state = await finish(priceJob.jobId);
    assert.equal(state.progress.percent, 100);
    const selected = state.result.data.find(r => r.roomName === 'غرفة ثلاثية');
    assert.equal(selected.dailyRates[0].roomOnlyPrice, null);
    assert.equal(selected.dailyRates[1].offers.roomOnly.packageId, 'real-quote-2027-02-02');
    assert.equal(selected.dailyRates.length, 31);
    assert.equal(starts, 31, 'Price job uses the same source quotes rather than scraping the month again');
    const invalid = await nativeFetch(`${api}/hotel-rooms-list`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, checkOut: '2027-04-10' }) });
    assert.equal(invalid.status, 400); assert.equal(starts, 31);
  } finally {
    globalThis.fetch = nativeFetch;
    for (const [key, value] of Object.entries(savedEnv)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
});
