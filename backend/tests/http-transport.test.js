import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createCurlFetch, createAlmosaferFetch } from '../scrapers/almosafer-http.js';
import { createEnigmaClient } from '../scrapers/enigma.js';
import { createAlmosaferBrowserFetch } from '../scrapers/almosafer-browser-http.js';
import { almosaferConnection } from '../scrapers/almosafer-connection.js';
import { isChallengeResponse } from '../scrapers/challenge-response.js';

function mockWorker() {
  const workers = [], requests = [];
  const spawnImpl = (_python, args, options) => {
    assert.equal(options.windowsHide, true);
    assert.ok(args.some(arg => arg.endsWith('almosafer-http-worker.py')));
    const worker = new EventEmitter();
    worker.stdin = new PassThrough(); worker.stdout = new PassThrough(); worker.stderr = new PassThrough();
    worker.kill = () => { worker.killed = true; };
    worker.stdin.on('data', chunk => requests.push(JSON.parse(chunk.toString())));
    workers.push(worker);
    return worker;
  };
  const reply = (request, body, headers = []) => workers.at(-1).stdout.write(JSON.stringify({ id: request.id, status: 200, headers, body }) + '\n');
  return { spawnImpl, workers, requests, reply };
}

test('HTTP bridge keeps one worker, handles concurrent out-of-order responses and preserves cookies', async () => {
  const mock = mockWorker(), transport = createCurlFetch(mock);
  try {
    const first = transport('https://global.almosafer.com/ar/hotels-home', { headers: { token: 'private-test' } });
    const second = transport('https://www.almosafer.com/api/enigma/autocomplete');
    assert.equal(mock.workers.length, 1);
    assert.equal(mock.requests[0].headers.token, 'private-test');
    mock.reply(mock.requests[1], '{"second":true}');
    mock.reply(mock.requests[0], '<html>first</html>', [['set-cookie', 'one=a; Secure'], ['set-cookie', 'two=b; Secure'], ['content-encoding', 'br'], ['content-length', '1']]);
    assert.deepEqual(await (await second).json(), { second: true });
    const result = await first;
    assert.deepEqual(result.headers.getSetCookie(), ['one=a; Secure', 'two=b; Secure']);
    assert.equal(result.headers.get('content-encoding'), null);
    assert.equal(await result.text(), '<html>first</html>');
  } finally { transport.close(); }
});

test('HTTP bridge rejects unrelated origins and URL credentials before launching a worker', async () => {
  const mock = mockWorker(), transport = createCurlFetch(mock);
  for (const url of ['http://www.almosafer.com/', 'https://127.0.0.1/', 'https://www.almosafer.com.evil.test/', 'https://user:secret@global.almosafer.com/']) await assert.rejects(transport(url));
  assert.equal(mock.workers.length, 0);
});

test('Aborting one HTTP request cancels its worker task without losing other responses', async () => {
  const mock = mockWorker(), transport = createCurlFetch(mock), controller = new AbortController();
  try {
    const aborted = transport('https://www.almosafer.com/api/enigma/autocomplete', { signal: controller.signal });
    const other = transport('https://www.almosafer.com/ar/hotels-home');
    controller.abort();
    await assert.rejects(aborted, error => error.name === 'AbortError');
    assert.deepEqual(mock.requests.at(-1), { id: mock.requests[0].id, cancel: true });
    mock.reply(mock.requests[0], 'late response');
    mock.reply(mock.requests[1], 'valid response');
    assert.equal(await (await other).text(), 'valid response');
  } finally { transport.close(); }
});

test('Failed HTTP workers reject pending requests privately and a new worker can recover', async () => {
  const mock = mockWorker(), transport = createCurlFetch(mock);
  try {
    const pending = transport('https://www.almosafer.com/ar/hotels-home');
    mock.workers[0].emit('error', new Error('signed-url?secret-token'));
    await assert.rejects(pending, error => !error.message.includes('secret-token'));
    const next = transport('https://www.almosafer.com/ar/hotels-home');
    assert.equal(mock.workers.length, 2);
    mock.reply(mock.requests.at(-1), 'recovered');
    assert.equal(await (await next).text(), 'recovered');
  } finally { transport.close(); }
});

test('A Cloudflare package challenge cannot trigger repeated session and price attempts', async () => {
  let calls = 0;
  const client = createEnigmaClient({ token: 'test', sleep: async () => {}, fetchImpl: async () => {
    calls++;
    return { status: 403, ok: false, text: async () => '<html>challenge-platform</html>' };
  } });
  await assert.rejects(client({ hotelId: '1287944' }), error => error.responseKind === 'challenge');
  assert.equal(calls, 1);
});

function browserMock(blocked = false, headless = true) {
  const requests = [], browsers = [];
  const launch = async options => {
    assert.equal(options.headless, headless);
    assert.ok(!options.args.includes('--ignore-certificate-errors'));
    const browser = { version: () => '133.0.0.0', close: async () => { browser.closed = true; }, newContext: async options => {
      assert.notEqual(options.ignoreHTTPSErrors, true);
      return { cookies: async origin => { assert.match(origin, /^https:\/\/(?:www|global)\.almosafer\.com$/); return [{ name: 'session', value: 'private-cookie', path: '/' }, { name: 'language', value: 'العربية', path: '/' }]; }, newPage: async () => {
        const page = new EventEmitter(), frame = {}, response = status => ({ status: () => status, allHeaders: async () => ({ server: 'cloudflare', ':status': String(status), 'set-cookie': 'language=العربية', 'content-encoding': 'br' }), request: () => ({ isNavigationRequest: () => true }), frame: () => frame });
        page.mainFrame = () => frame;
        page.goto = async url => { page.href = url; return response(403); };
        page.url = () => page.href;
        page.waitForFunction = async () => { if (blocked) throw new Error('Challenge remains'); page.emit('response', response(200)); };
        page.content = async () => blocked ? '<html>challenge-platform</html>' : '<script id="__NEXT_DATA__">{"props":{"pageProps":{"APIToken":"actual-public-token"}}}</script>';
        page.close = async () => {};
        page.evaluate = async (_fn, request) => {
          requests.push(request);
          assert.equal(request.headers.token, 'actual-public-token');
          assert.equal(request.headers.cookie, undefined); assert.equal(request.headers['user-agent'], undefined);
          const body = request.url.includes('/poll/') ? { hotelId: '1287944', currencyCode: 'SAR', numberOfNights: 1, pollingStatus: 'COMPLETED_SUCCESSFULLY', packagesGroups: [] } : { pId: 'complete-query', hotelId: '1287944' };
          return { body: JSON.stringify(body), status: 200, headers: {} };
        };
        return page;
      } };
    } };
    browsers.push(browser); return browser;
  };
  return { launch, requests, browsers };
}

test('Automatic page JavaScript and API prices use one browser session with real source cookies', async () => {
  const mock = browserMock(), transport = createAlmosaferBrowserFetch(mock);
  try {
    const client = createEnigmaClient({ fetchImpl: transport, token: '', sleep: async () => {} });
    const payload = { hotelId: '1287944', checkIn: '2026-10-11', checkOut: '2026-10-12', currency: 'SAR', roomsInfo: [{ adultsCount: 2, kidsAges: [] }] };
    assert.deepEqual(await client(payload, { maxAttempts: 1 }), {});
    assert.equal(mock.browsers.length, 1); assert.equal(mock.requests.length, 2);
    assert.deepEqual(JSON.parse(mock.requests[0].body), payload);
    assert.ok(mock.requests.every(request => new URL(request.url).hostname === 'www.almosafer.com'));
  } finally { await transport.close(); }
  assert.ok(mock.browsers.every(browser => browser.closed));
});

test('A remaining browser challenge never supplies a fallback token or launches a price request', async () => {
  const mock = browserMock(true), transport = createAlmosaferBrowserFetch(mock);
  try {
    const client = createEnigmaClient({ fetchImpl: transport, token: '', sleep: async () => {} });
    await assert.rejects(client({ hotelId: '1287944', roomsInfo: [{ adultsCount: 2, kidsAges: [] }] }), error => error.upstreamStatus === 403 && error.responseKind === 'challenge');
    assert.equal(mock.requests.length, 0);
    await assert.rejects(transport('https://127.0.0.1/api/'));
    assert.equal(mock.browsers.length, 1);
  } finally { await transport.close(); }
});

test('Browser-first scraping never bootstraps through a separate HTTP connection', async () => {
  const mock = browserMock();
  const transport = createAlmosaferFetch({ env: { ALMOSAFER_HTTP_TRANSPORT: 'browser' },
    nativeFetch: () => { throw new Error('Must stay in browser'); },
    createCurl: () => { throw new Error('Must stay in browser'); },
    createBrowser: () => createAlmosaferBrowserFetch({ ...mock, env: {} }) });
  try {
    const client = createEnigmaClient({ fetchImpl: transport, token: '', sleep: async () => {} });
    await client({ hotelId: '1287944', roomsInfo: [{ adultsCount: 2, kidsAges: [] }] }, { maxAttempts: 1 });
    assert.equal(mock.browsers.length, 1);
    assert.equal(mock.requests.length, 2);
  } finally { await transport.close(); }
});

test('API challenge fallback replaces the old HTTP token with the new browser session token', async () => {
  const mock = browserMock(), calls = [];
  const transport = createAlmosaferFetch({ env: { ALMOSAFER_BROWSER_FALLBACK: '1' },
    nativeFetch: async url => {
      calls.push(url);
      return new Response('verification', { status: 403, headers: { 'cf-mitigated': 'challenge' } });
    }, createBrowser: () => createAlmosaferBrowserFetch({ ...mock, env: {} }) });
  const url = 'https://www.almosafer.com/api/enigma/v7/packages';
  try {
    const options = { method: 'PUT', headers: { token: 'old-http-token', Referer: 'https://www.almosafer.com/ar/hotel/details/atg/hotel-1287944' }, body: '{}' };
    assert.equal((await transport(url, options)).status, 200);
    await transport(url, options);
    assert.equal(calls.length, 1);
    assert.ok(mock.requests.every(request => request.headers.token === 'actual-public-token'));
    assert.equal(mock.requests.length, 2);
  } finally { await transport.close(); }
});

test('An idle browser restart cannot send a token from the closed session', async () => {
  const mock = browserMock();
  const transport = createAlmosaferBrowserFetch({ ...mock, env: {}, idleMs: 5 });
  const options = { headers: { token: 'token-from-closed-session' } };
  try {
    await transport('https://www.almosafer.com/api/enigma/v7/packages', options);
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(mock.browsers[0].closed, true);
    await transport('https://www.almosafer.com/api/enigma/v7/packages', options);
    assert.equal(mock.browsers.length, 2);
    assert.ok(mock.requests.every(request => request.headers.token === 'actual-public-token'));
  } finally { await transport.close(); }
});

test('Challenges with 200/503 and cf-mitigated activate fallback without switching other origins', async () => {
  for (const status of [200, 503]) {
    const nativeCalls = [], browserCalls = [];
    const browser = async url => { browserCalls.push(url); return new Response('browser result'); };
    browser.close = async () => {};
    const transport = createAlmosaferFetch({ env: { ALMOSAFER_BROWSER_FALLBACK: '1' },
      nativeFetch: async url => {
        nativeCalls.push(url);
        return url.includes('global.') ? new Response('global result') :
          new Response('<html>verification</html>', { status, headers: { 'cf-mitigated': 'challenge' } });
      }, createBrowser: () => browser });
    try {
      assert.equal(await (await transport('https://www.almosafer.com/ar/hotels-home')).text(), 'browser result');
      await transport('https://www.almosafer.com/api/enigma/autocomplete');
      assert.equal(await (await transport('https://global.almosafer.com/ar/hotels-home')).text(), 'global result');
      assert.equal(nativeCalls.length, 2); assert.equal(browserCalls.length, 2);
    } finally { await transport.close(); }
  }
});

test('Normal source pages with CAPTCHA or JavaScript detection do not become challenge pages', async () => {
  const html = '<html><title>Hotel</title><script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script><div id="captcha"></div></html>';
  const response = new Response(html, { headers: { 'content-type': 'text/html' } });
  assert.equal(await isChallengeResponse(response), false);
  assert.equal(await response.text(), html);
  for (const status of [200, 503]) assert.equal(await isChallengeResponse(new Response('<html><title>Just a moment...</title>challenge-platform</html>', { status, headers: { 'content-type': 'text/html' } })), true);
});

test('Browser startup failure preserves the upstream refusal and can retry initialization', async () => {
  let launches = 0;
  const browser = async () => new Response('recovered'); browser.close = async () => {};
  const transport = createAlmosaferFetch({ env: { ALMOSAFER_BROWSER_FALLBACK: '1' },
    nativeFetch: async () => new Response('challenge-platform', { status: 403 }),
    createBrowser: () => { if (++launches === 1) throw new Error('startup failed'); return browser; } });
  try {
    assert.equal((await transport('https://www.almosafer.com/ar/hotels-home')).status, 403);
    assert.equal(await (await transport('https://www.almosafer.com/ar/hotels-home')).text(), 'recovered');
    assert.equal(launches, 2);
  } finally { await transport.close(); }
});

test('Explicit outbound proxy config reaches the browser without credentials in the server field', async () => {
  const env = { ALMOSAFER_HTTP_TRANSPORT: 'browser', ALMOSAFER_PROXY_URL: 'http://user:p%40ss%23word@proxy.example:8080' };
  const mock = browserMock();
  const transport = createAlmosaferBrowserFetch({ ...mock, env, launch: async options => {
    assert.deepEqual(options.proxy, { server: 'http://proxy.example:8080', username: 'user', password: 'p@ss#word' });
    return mock.launch(options);
  } });
  try { await transport('https://www.almosafer.com/ar/hotels-home'); }
  finally { await transport.close(); }
  for (const value of ['bad-secret-value', 'ftp://secret@proxy.example', 'http://secret@proxy.example/path', 'socks5://secret:password@proxy.example:1080']) {
    assert.throws(() => almosaferConnection({ ALMOSAFER_PROXY_URL: value }), error => !error.message.includes('secret'));
  }
  assert.throws(() => almosaferConnection({ ...env, ALMOSAFER_HTTP_TRANSPORT: 'native' }), /curl.*browser/);
});

test('Docker display mode uses a full browser and retains the same API session', async () => {
  const mock = browserMock(false, false);
  const transport = createAlmosaferBrowserFetch({ ...mock, env: { ALMOSAFER_BROWSER_HEADLESS: '0' } });
  try {
    await transport('https://www.almosafer.com/ar/hotels-home');
    await transport('https://www.almosafer.com/api/enigma/v7/packages', { headers: { token: 'old' } });
    assert.equal(mock.browsers.length, 1);
    assert.equal(mock.requests.length, 1);
  } finally { await transport.close(); }
});
