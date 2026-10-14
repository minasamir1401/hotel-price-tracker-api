import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKeys, maskKey, createKeyPool } from '../scrapers/scrapingant-keys.js';
import { createScrapingAntFetch } from '../scrapers/scrapingant-fetch.js';
import { almosaferConnection } from '../scrapers/almosafer-connection.js';

test('ScrapingAnt key parsing handles multiple separators, whitespace and empty entries', () => {
  const parsed = parseKeys('key1, key2;key3 \n key4');
  assert.deepEqual(parsed, ['key1', 'key2', 'key3', 'key4']);
  assert.deepEqual(parseKeys(''), []);
  assert.deepEqual(parseKeys(null), []);
});

test('ScrapingAnt key masking protects credentials while preserving diagnostics', () => {
  assert.equal(maskKey('fixture-scrapingant-key-0001'), 'fixt...001');
  assert.equal(maskKey('short'), '***');
  assert.equal(maskKey(''), '');
});

test('ScrapingAnt key pool rotates keys in strict round-robin sequence', () => {
  const pool = createKeyPool({ keys: ['key-a', 'key-b', 'key-c'] });
  assert.equal(pool.getNextKey(), 'key-a');
  assert.equal(pool.getNextKey(), 'key-b');
  assert.equal(pool.getNextKey(), 'key-c');
  assert.equal(pool.getNextKey(), 'key-a');
  assert.equal(pool.getNextKey(), 'key-b');
});

test('ScrapingAnt key pool handles single key without errors', () => {
  const pool = createKeyPool({ keys: ['only-one-key'] });
  assert.equal(pool.getNextKey(), 'only-one-key');
  assert.equal(pool.getNextKey(), 'only-one-key');
});

test('ScrapingAnt key pool throws when no keys are configured', () => {
  const pool = createKeyPool({ keys: [] });
  assert.throws(() => pool.getNextKey(), /SCRAPINGANT_API_KEYS/);
});

test('ScrapingAnt key pool bypasses exhausted keys during cooldown', () => {
  let virtualTime = 1000;
  const pool = createKeyPool({
    keys: ['key-1', 'key-2', 'key-3'],
    now: () => virtualTime,
  });

  assert.equal(pool.getNextKey(), 'key-1');
  pool.markKeyExhausted('key-2', 5000);

  // Key 2 is in cooldown, should pick Key 3
  assert.equal(pool.getNextKey(), 'key-3');
  // Next should wrap back to Key 1
  assert.equal(pool.getNextKey(), 'key-1');

  // Advance time past cooldown
  virtualTime += 6000;
  assert.equal(pool.getNextKey(), 'key-2');
});

test('ScrapingAnt redaction cleans all configured raw keys from strings and errors', () => {
  const pool = createKeyPool({ keys: ['fixture-scrapingant-key-0001', 'fixture-scrapingant-key-0002'] });
  const message = 'Failed at url https://api.scrapingant.com?x-api-key=fixture-scrapingant-key-0001 and fixture-scrapingant-key-0002';
  const cleaned = pool.redact(message);
  assert.equal(cleaned.includes('fixture-scrapingant-key-0001'), false);
  assert.equal(cleaned.includes('fixture-scrapingant-key-0002'), false);
  assert.equal(cleaned.includes('[SCRAPINGANT_KEY_REDACTED]'), true);

  const error = new Error('Secret: fixture-scrapingant-key-0001');
  pool.redact(error);
  assert.equal(error.message.includes('fixture-scrapingant-key-0001'), false);
});

test('ScrapingAnt fetch rotates key on each request and translates target headers and status', async () => {
  const pool = createKeyPool({ keys: ['key-alpha', 'key-beta'] });
  const calls = [];

  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    const responseHeaders = new Headers();
    responseHeaders.set('ant-page-status-code', '200');
    responseHeaders.set('ant-original-header-content-type', 'application/json');
    responseHeaders.set('ant-original-header-x-upstream-id', 'test-upstream');
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: responseHeaders,
    });
  };

  const saFetch = createScrapingAntFetch({ keyPool: pool, fetchImpl: fakeFetch });

  // Request 1: API request -> browser=false, key-alpha
  const res1 = await saFetch('https://www.almosafer.com/api/enigma/autocomplete?query=test', {
    method: 'GET',
    headers: {
      token: 'session-token-1',
      'x-api-key': 'apikey-hotel',
    },
  });

  assert.equal(res1.status, 200);
  assert.equal(res1.headers.get('content-type'), 'application/json');
  assert.equal(res1.headers.get('x-upstream-id'), 'test-upstream');
  assert.equal(calls[0].options.headers['x-api-key'], 'key-alpha');
  assert.equal(calls[0].options.headers['ant-token'], 'session-token-1');
  assert.equal(calls[0].options.headers['ant-x-api-key'], 'apikey-hotel');
  assert.equal(calls[0].url.includes('browser=false'), true);

  // Request 2: HTML request -> browser=true, key-beta (rotation in action!)
  const res2 = await saFetch('https://www.almosafer.com/ar/hotels-home', {
    method: 'GET',
    headers: {
      Accept: 'text/html',
    },
  });

  assert.equal(res2.status, 200);
  assert.equal(calls[1].options.headers['x-api-key'], 'key-beta');
  assert.equal(calls[1].url.includes('browser=true'), true);
});

test('ScrapingAnt fetch automatically retries next key on 429 quota exhaustion', async () => {
  const pool = createKeyPool({ keys: ['key-1', 'key-2'] });
  const keysUsed = [];

  const fakeFetch = async (url, options) => {
    const key = options.headers['x-api-key'];
    keysUsed.push(key);
    if (key === 'key-1') {
      return new Response('Quota exceeded', { status: 429 });
    }
    const headers = new Headers();
    headers.set('ant-page-status-code', '200');
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  };

  const saFetch = createScrapingAntFetch({ keyPool: pool, fetchImpl: fakeFetch });
  const res = await saFetch('https://www.almosafer.com/api/enigma/v7/packages', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hotelId: '123' }),
  });

  assert.equal(res.status, 200);
  assert.deepEqual(keysUsed, ['key-1', 'key-2']);
  assert.equal(pool.isHealthy('key-1'), false);
  assert.equal(pool.isHealthy('key-2'), true);
});

test('almosaferConnection correctly recognizes scrapingant transport', () => {
  const config = almosaferConnection({
    ALMOSAFER_HTTP_TRANSPORT: 'scrapingant',
    SCRAPINGANT_API_KEYS: 'key1,key2',
  });
  assert.equal(config.transport, 'scrapingant');
  assert.equal(config.remote, false);

  // Auto-detect when transport is not explicitly set
  const autoConfig = almosaferConnection({
    SCRAPINGANT_API_KEYS: 'key1,key2',
  });
  assert.equal(autoConfig.transport, 'scrapingant');
});

test('Provider 423 is identified as a bounded session rejection without returning provider JSON as hotel content', async () => {
  const pool = createKeyPool({ keys: ['fixture-provider-key-123456'] });
  let calls = 0;
  const client = createScrapingAntFetch({ keyPool: pool, fetchImpl: async () => {
    calls++;
    return new Response(JSON.stringify({ detail: 'Our browser was detected by target site. fixture-provider-key-123456' }), { status: 423 });
  } });
  await assert.rejects(client('https://www.almosafer.com/ar/hotels-home'), error => {
    assert.equal(error.code, 'SCRAPINGANT_TARGET_DETECTED');
    assert.equal(error.upstreamStatus, 423);
    assert.equal(error.upstreamHost, 'api.scrapingant.com');
    assert.equal(error.responseKind, 'challenge');
    assert.ok(error.diagnosticId);
    assert.ok(!error.message.includes('fixture-provider-key-123456'));
    return true;
  });
  assert.equal(calls, 1);
});

test('A target rejection in a successful provider response retains its actual HTTP status and content', async () => {
  const client = createScrapingAntFetch({ keyPool: createKeyPool({ keys: ['fixture-key'] }), fetchImpl: async () =>
    new Response('Target locked', { status: 200, headers: { 'ant-page-status-code': '423', 'ant-original-header-content-type': 'text/plain' } }) });
  const response = await client('https://www.almosafer.com/api/enigma/v7/packages');
  assert.equal(response.status, 423);
  assert.equal(await response.text(), 'Target locked');
});
