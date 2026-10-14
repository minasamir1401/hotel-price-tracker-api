import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookingPriceAccess } from '../booking-price-access.js';
import { createSearchJobs } from '../search-jobs.js';

const req = cookie => ({ headers: { host: 'prices.test', origin: 'https://prices.test', ...(cookie ? { cookie } : {}) }, ip: '127.0.0.1' });
const ownerKey = 'fixture-owner-key-of-at-least-32-characters';
const cookieValue = result => result.cookie.split(';')[0];

test('Configured account credentials cannot expose private prices without owner access configuration and login', () => {
  assert.throws(() => createBookingPriceAccess({ env: {} }).authorize(req(), 'account'), { code: 'BOOKING_ACCOUNT_ACCESS_NOT_CONFIGURED' });
  const access = createBookingPriceAccess({ env: { BOOKING_ACCOUNT_ACCESS_KEY: ownerKey } });
  assert.equal(access.authorize(req(), 'guest'), null);
  assert.throws(() => access.authorize(req(), 'account'), { code: 'BOOKING_ACCOUNT_ACCESS_REQUIRED' });
  assert.throws(() => access.login(req(), 'wrong'), { code: 'BOOKING_ACCESS_INVALID' });
  const result = access.login(req(), ownerKey);
  const signed = req(cookieValue(result));
  assert.ok(access.authorize(signed, 'account'));
  assert.match(result.cookie, /HttpOnly; SameSite=Strict/);
  assert.ok(!result.cookie.includes(ownerKey));
  assert.ok(!JSON.stringify(access.status(signed)).includes(ownerKey));
});

test('Forged, expired, rotated and cross-origin owner sessions cannot authorize account prices', () => {
  let time = 10000;
  const env = { BOOKING_ACCOUNT_ACCESS_KEY: ownerKey, NODE_ENV: 'production' };
  const access = createBookingPriceAccess({ env, now: () => time });
  const result = access.login(req(), ownerKey), signed = req(cookieValue(result));
  assert.match(result.cookie, /; Secure/);
  const tampered = req(cookieValue(result) + 'x');
  assert.throws(() => access.authorize(tampered, 'account'), { code: 'BOOKING_ACCOUNT_ACCESS_REQUIRED' });
  assert.throws(() => access.authorize({ ...signed, headers: { ...signed.headers, origin: 'https://other.test' } }, 'account'), { code: 'BOOKING_ACCESS_ORIGIN_REJECTED' });
  time = result.expiresAt;
  assert.equal(access.ownerScope(signed), null);
  time = 10000; env.BOOKING_ACCOUNT_ACCESS_KEY = ownerKey + '-rotated';
  assert.equal(access.ownerScope(signed), null);
});

test('Repeated invalid owner keys are bounded without exposing credentials', () => {
  const access = createBookingPriceAccess({ env: { BOOKING_ACCOUNT_ACCESS_KEY: ownerKey } });
  for (let attempt = 0; attempt < 5; attempt++) assert.throws(() => access.login(req(), 'wrong'), { status: 401 });
  assert.throws(() => access.login(req(), 'wrong'), { code: 'BOOKING_ACCESS_RATE_LIMITED', status: 429 });
  // All visitors can share nginx's socket IP; attackers still cannot block the owner.
  assert.ok(access.login(req(), ownerKey).cookie);
});

test('Private background jobs cannot be polled or joined by another owner or guest, while public jobs remain accessible', async () => {
  const input = { hotelInput: 'booking:14720082', checkIn: '2026-10-14', checkOut: '2026-10-15', sources: ['booking'] };
  const jobs = createSearchJobs({ execute: async () => ({ success: true, data: ['private account quote'] }) });
  const owner = jobs.start({ ...input, ownerScope: 'owner-a' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(jobs.get(owner.id), null);
  assert.equal(jobs.get(owner.id, { ownerScope: 'owner-b' }), null);
  assert.equal(jobs.get(owner.id, { ownerScope: 'owner-a' }).status, 'completed');
  const other = jobs.start({ ...input, ownerScope: 'owner-b' });
  assert.notEqual(other.id, owner.id);
  await new Promise(resolve => setImmediate(resolve));
  const guest = jobs.start(input);
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(jobs.get(guest.id));
  assert.ok(!JSON.stringify(jobs.get(owner.id, { ownerScope: 'owner-a' })).includes('owner-a'));
});
