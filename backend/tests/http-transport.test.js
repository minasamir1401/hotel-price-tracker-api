import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createCurlFetch } from '../scrapers/almosafer-http.js';
import { createEnigmaClient } from '../scrapers/enigma.js';

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
