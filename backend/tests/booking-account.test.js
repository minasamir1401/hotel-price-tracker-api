import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookingClient } from '../scrapers/booking-client.js';
import { bookingAccountContext, bookingPricingStatus, assertBookingAccountCurrent } from '../scrapers/booking-account-context.js';
import { createSearchJobs } from '../search-jobs.js';
import { createHotelRoomsService } from '../hotel-rooms-service.js';

const input = { hotelId: '14720082', checkIn: '2026-10-14', checkOut: '2026-10-15', roomsInfo: [{ adultsCount: 2, kidsAges: [] }] };
const environment = () => ({ BOOKING_APP_AUTHORIZATION: 'fixture', BOOKING_APP_SIGNATURE_SALT: 'fixture', BOOKING_APP_VERSION: 'fixture' });
const quote = (net, genius = false) => {
  const amount = value => ({ currency: 'SAR', value });
  const total = net === 178.2 ? 209.38 : net === 160.38 ? 188.45 : 176.25;
  return [{ hotel_id: 14720082, hotel_name: 'Luxury Suites', arrival_date: input.checkIn, departure_date: input.checkOut,
    currency_code: 'SAR', min_room_distribution: { adults: 2, children: [] }, total_blocks: 1,
    rooms: { '1472008201': {} }, block: [{ block_id: '1472008201_424896952_2_0_0', room_id: 1472008201,
      room_name: 'غرفة مزدوجة', nr_adults: 2, nr_children: 0, fit_occupancy: { nr_adults: 2, children_ages: [] },
      is_block_fit: 1, min_price: { price: total, currency: 'SAR' }, breakfast_included: 0, half_board: 0,
      full_board: 0, all_inclusive: 0, refundable: 1,
      product_price_breakdown: { net_amount: amount(net), all_inclusive_amount: amount(total), excluded_amount: amount(total-net),
        included_taxes_and_charges_amount: amount(0), strikethrough_amount: amount(220), discounted_amount: amount(220-net),
        items: [{ kind: 'discount', name: 'Mobile-only price' }, ...(genius ? [{ kind: 'discount', name: 'Genius 10%' }] : [])] } }] }];
};
const offer = data => Object.values(data)[0].offers.roomOnly;

test('Account mode requires a real server credential; supplied email, flags and expiry cannot invent one', () => {
  const env = environment();
  const client = createBookingClient({ env });
  assert.throws(() => client.forPricingMode('account'), { code: 'BOOKING_ACCOUNT_SESSION_REQUIRED' });
  assert.throws(() => client.forPricingMode('genius3'), { code: 'BOOKING_RATE_MODE_INVALID' });
  env.BOOKING_AUTH_TOKEN = 'fixture-session';
  assert.equal(bookingPricingStatus(env).loginVerified, false);
  env.BOOKING_AUTH_EXPIRES_AT = '2020-01-01T00:00:00Z';
  assert.throws(() => client.forPricingMode('account'), { code: 'BOOKING_ACCOUNT_SESSION_EXPIRED' });
  assert.throws(() => client.forPricingMode('auto'), { code: 'BOOKING_ACCOUNT_SESSION_EXPIRED' });
  assert.equal(bookingAccountContext(env, 'guest').session, 'guest');
  const context = bookingAccountContext({ BOOKING_AUTH_TOKEN: 'fixture', BOOKING_AUTH_EXPIRES_AT: '2026-10-14T12:00:00Z' }, 'account', Date.parse('2026-10-14T11:00:00Z'));
  assert.throws(() => assertBookingAccountCurrent(context, Date.parse('2026-10-14T12:00:00Z')), { code: 'BOOKING_ACCOUNT_SESSION_EXPIRED' });
});

test('Guest, account A and account B get their own source quotes and caches without exposing tokens', async () => {
  const env = environment(), calls = [];
  const client = createBookingClient({ env, fetchImpl: async (url, options) => {
    const token = new URL(url).searchParams.get('auth_token');
    assert.equal(options.headers['X-Access-Token'] || null, token);
    calls.push(token);
    return { ok: true, json: async () => quote(token === 'fixture-A' ? 160.38 : token === 'fixture-B' ? 150 : 178.2, Boolean(token)) };
  } });
  const guest = offer(await client.rooms({ ...input, geniusActive: true, auth_token: 'untrusted' }));
  assert.equal(guest.price, 209.38);
  assert.equal(guest.rateContext.session, 'guest');
  assert.equal(guest.rateContext.geniusDiscountApplied, false);
  env.BOOKING_AUTH_TOKEN = 'fixture-A';
  const a = offer(await client.rooms(input));
  assert.equal(a.taxBreakdown.priceBeforeTax, 160.38);
  assert.equal(a.price, 188.45);
  assert.equal(a.rateContext.geniusDiscountApplied, true);
  assert.equal(offer(await client.rooms(input)).price, a.price);
  env.BOOKING_AUTH_TOKEN = 'fixture-B';
  const b = offer(await client.rooms(input));
  assert.equal(b.price, 176.25);
  assert.equal(offer(await client.rooms(input, { rateMode: 'guest' })).price, guest.price);
  assert.deepEqual(calls, [null, null, 'fixture-A', 'fixture-A', 'fixture-B', 'fixture-B']);
  assert.ok(!JSON.stringify([a,b,guest,client.pricingStatus()]).includes('fixture-A'));
  assert.ok(!JSON.stringify(a).includes('scopeId'));
});

test('A session switch during flight cannot mix account identities between hotelPage and roomList', async () => {
  const env = { ...environment(), BOOKING_AUTH_TOKEN: 'fixture-A' }, calls = [];
  const client = createBookingClient({ env, fetchImpl: async url => {
    const parsed = new URL(url), token = parsed.searchParams.get('auth_token');
    calls.push(token);
    env.BOOKING_AUTH_TOKEN = 'fixture-B';
    return { ok: true, json: async () => quote(token === 'fixture-A' ? 160.38 : 150, true) };
  } });
  const a = client.forPricingMode('account');
  assert.equal(offer(await a.rooms(input)).price, 188.45);
  assert.deepEqual(calls, ['fixture-A','fixture-A']);
  assert.equal(offer(await a.rooms(input)).price, 188.45);
  assert.equal(offer(await client.forPricingMode('account').rooms(input)).price, 176.25);
});

test('Rejected account authentication never uses a successful cached guest quote', async () => {
  const env = environment();
  const client = createBookingClient({ env, fetchImpl: async url => new URL(url).searchParams.has('auth_token')
    ? { ok: false, status: 401, text: async () => 'invalid token' }
    : { ok: true, json: async () => quote(178.2) } });
  await client.rooms(input);
  env.BOOKING_AUTH_TOKEN = 'fixture-rejected';
  await assert.rejects(client.rooms(input), { code: 'UPSTREAM_AUTH_REJECTED' });
});

test('Background job reuse is separated by server session even for the same browser request ID', async () => {
  let scope = 'guest', calls = 0;
  const jobs = createSearchJobs({ cacheScope: () => scope, execute: async () => ({ success: true, calls: ++calls }) });
  const request = { ...input, hotelInput: 'booking:14720082', sources: ['booking'], requestId: '11111111-1111-1111-1111-111111111111' };
  const guest = jobs.start(request);
  await new Promise(resolve => setImmediate(resolve));
  scope = 'account';
  const account = jobs.start(request);
  await new Promise(resolve => setImmediate(resolve));
  assert.notEqual(guest.id, account.id);
  assert.equal(calls, 2);
  assert.equal(jobs.start(request).id, account.id);
});

test('Room selector scopes its own cache and hotel discovery to the chosen account', async () => {
  const env = environment(), calls = [];
  const client = createBookingClient({ env, fetchImpl: async url => {
    const token = new URL(url).searchParams.get('auth_token');
    calls.push(token);
    const data = quote(token ? 160.38 : 178.2, Boolean(token));
    data[0].block[0].room_name = token ? 'Account room' : 'Guest room';
    return { ok: true, json: async () => data };
  } });
  const list = createHotelRoomsService({ bookingClient: client,
    resolveBooking: async (_, params, scoped) => scoped.hotelDetails({ ...input, checkIn: params.checkIn, checkOut: params.checkOut }) });
  const query = { hotelInput: 'booking:14720082', source: 'booking', checkIn: input.checkIn, adults: 2, rooms: 1 };
  assert.deepEqual((await list(query)).rooms, ['Guest room']);
  env.BOOKING_AUTH_TOKEN = 'fixture-account';
  assert.deepEqual((await list(query)).rooms, ['Account room']);
  assert.deepEqual((await list({ ...query, bookingRateMode: 'guest' })).rooms, ['Guest room']);
  assert.equal(calls.filter(token => token === 'fixture-account').length, 3);
});
