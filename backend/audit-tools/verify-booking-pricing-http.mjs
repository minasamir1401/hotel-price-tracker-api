// Read-only HTTP smoke check. Uses only configured server credentials.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as pause } from 'node:timers/promises';
import { datePairs } from '../scrapers/almosafer-live.js';

process.env.PORT = '0';
const { server } = await import('../server.js');
if (!server.listening) await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const dateIndex = process.argv.indexOf('--date');
const checkIn = dateIndex >= 0 ? process.argv[dateIndex + 1] : '2026-10-15';
const checkOut = new Date(Date.parse(checkIn + 'T12:00:00Z') + 86400000).toISOString().slice(0,10);
datePairs(checkIn,checkOut);
const request = { hotelInput: 'https://www.booking.com/Share-OXqf6H', sources: ['booking'],
  checkIn, checkOut, adults: 2, rooms: 1, refresh: true };
const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
try {
  const state = await (await fetch(base + '/api/booking-session')).json();
  assert.equal(state.connected, false);
  assert.equal(state.pricing.loginVerified, false);
  if (!state.pricing.credentialConfigured) {
    for (const background of [false, true]) {
      const rejected = await post('/api/search-hotel-prices', { ...request, bookingRateMode: 'account', background });
      assert.equal(rejected.status, 409);
      assert.equal((await rejected.json()).code, 'BOOKING_ACCOUNT_SESSION_REQUIRED');
    }
    const picker = await post('/api/hotel-rooms-list', { ...request, source: 'booking', bookingRateMode: 'account', background: true });
    assert.equal(picker.status, 409);
    assert.equal((await picker.json()).code, 'BOOKING_ACCOUNT_SESSION_REQUIRED');
    console.log('Account mode: missing real session is rejected before any price request.');
  }
  if (process.argv.includes('--live-guest')) {
    const response = await post('/api/search-hotel-prices', { ...request, bookingRateMode: 'guest', background: true });
    assert.equal(response.status, 202);
    const { jobId } = await response.json();
    let job;
    for (let attempt = 0; attempt < 90; attempt++) {
      job = await (await fetch(base + '/api/search-jobs/' + jobId)).json();
      if (job.status !== 'running') break;
      await pause(1000);
    }
    assert.equal(job.status, 'completed', job.error?.message);
    const room = job.result.data.find(item => item.roomName === 'غرفة مزدوجة');
    assert.ok(room, 'Source double-room quote missing');
    const offer = room.dailyRates[0].offers.roomOnly;
    assert.equal(offer.rateContext.session, 'guest');
    assert.equal(offer.rateContext.geniusDiscountApplied, false);
    assert.ok(Math.abs(offer.taxBreakdown.priceBeforeTax + offer.taxBreakdown.taxesAndFees - offer.price) < 0.011);
    console.log(JSON.stringify({ testedAt: new Date().toISOString(), hotel: room.hotelName,
      date: request.checkIn, nextDate: request.checkOut, room: room.roomName,
      source: offer.source, roomSizeM2: room.roomSizeM2, roomsLeft: offer.roomsLeft,
      refundableUntil: offer.refundableUntil, noCreditCard: offer.noCreditCard,
      priceBeforeTax: offer.taxBreakdown.priceBeforeTax, taxes: offer.taxBreakdown.taxesAndFees,
      total: offer.price, discounts: offer.discountLabels, context: offer.rateContext }));
  }
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
