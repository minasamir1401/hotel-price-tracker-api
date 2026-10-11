import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { almosaferOrigin } from './almosafer-origin.js';

export const webUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const workerPath = fileURLToPath(new URL('./almosafer-http-worker.py', import.meta.url));

// One public cookie jar per origin, with concurrent requests and bounded deadlines.
export function createCurlFetch({ python = process.env.ALMOSAFER_PYTHON || 'python3', spawnImpl = spawn, idleMs = 60000 } = {}) {
  let worker, buffer = '', sequence = 0, idleTimer;
  const pending = new Map();
  const fail = () => new Error('تعذر تشغيل اتصال HTTP للمسافر أو انتهت مهلة الاتصال');
  function close() {
    const previous = worker;
    worker = null;
    clearTimeout(idleTimer);
    for (const entry of pending.values()) entry.reject(fail());
    pending.clear();
    previous?.stdin.destroy();
    previous?.kill();
  }
  function scheduleClose() {
    clearTimeout(idleTimer);
    if (!pending.size) idleTimer = setTimeout(close, idleMs).unref();
  }
  function start() {
    if (worker) return;
    buffer = '';
    worker = spawnImpl(python, ['-u', workerPath], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const current = worker;
    const onFailure = () => { if (worker === current) close(); };
    current.on('error', onFailure);
    current.on('exit', onFailure);
    current.stdin.on('error', onFailure);
    // Never forward Python tracebacks: they can contain credentials or response bodies.
    current.stderr.resume();
    current.stdout.setEncoding('utf8');
    current.stdout.on('data', chunk => {
      if (worker !== current) return;
      buffer += chunk;
      if (Buffer.byteLength(buffer) > 40 * 1024 * 1024) return close();
      let index;
      while ((index = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        let reply;
        try { reply = JSON.parse(line); } catch { return close(); }
        const entry = pending.get(reply.id);
        if (!entry) continue;
        pending.delete(reply.id);
        if (reply.error) entry.reject(fail());
        else {
          try {
            const headers = new Headers();
            for (const [name, value] of reply.headers || []) {
              if (!['content-encoding', 'content-length'].includes(name.toLowerCase())) headers.append(name, value);
            }
            entry.resolve(new Response([204, 205, 304].includes(reply.status) ? null : reply.body, { status: reply.status, headers }));
          } catch { entry.reject(fail()); }
        }
        scheduleClose();
      }
    });
  }
  async function curlFetch(url, options = {}) {
    const parsed = new URL(url);
    almosaferOrigin(parsed.origin);
    if (parsed.username || parsed.password) throw new Error('رابط المصدر غير صالح');
    options.signal?.throwIfAborted();
    if (pending.size >= 64) throw new Error('طلبات المسافر قيد التنفيذ؛ حاول بعد قليل');
    start();
    clearTimeout(idleTimer);
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); };
      const abort = () => {
        pending.delete(id);
        worker?.stdin.write(JSON.stringify({ id, cancel: true }) + '\n');
        cleanup();
        reject(options.signal?.reason || fail());
        scheduleClose();
      };
      const timer = setTimeout(abort, 21000);
      pending.set(id, {
        resolve: value => { cleanup(); resolve(value); },
        reject: error => { cleanup(); reject(error); },
      });
      options.signal?.addEventListener('abort', abort, { once: true });
      worker.stdin.write(JSON.stringify({ id, url: parsed.href, method: options.method || 'GET',
        headers: Object.fromEntries(new Headers(options.headers)), body: options.body,
        deadline: Date.now() + 20000 }) + '\n');
    });
  }
  curlFetch.close = close;
  return curlFetch;
}

let defaultCurl;
let defaultBrowser;
const browserOrigins = new Set();
// Read after server.js has loaded local .env files; Docker also sets this explicitly.
export async function almosaferFetch(url, options) {
  const origin = almosaferOrigin(new URL(url).origin);
  if (browserOrigins.has(origin)) return (await defaultBrowser)(url, options);
  let response;
  if (process.env.ALMOSAFER_HTTP_TRANSPORT === 'curl') {
    defaultCurl ||= createCurlFetch();
    response = await defaultCurl(url, options);
  } else response = await fetch(url, options);
  if (process.env.ALMOSAFER_BROWSER_FALLBACK !== '1' || response.status !== 403) return response;
  const body = (await response.clone().text()).slice(0, 16384);
  if (!/challenge-platform|captcha|verify you are human/i.test(body)) return response;
  defaultBrowser ||= import('./almosafer-browser-http.js').then(module => module.createAlmosaferBrowserFetch());
  browserOrigins.add(origin);
  try { return await (await defaultBrowser)(url, options); }
  catch { browserOrigins.delete(origin); return response; }
}
almosaferFetch.close = () => {
  defaultCurl?.close(); defaultCurl = null;
  defaultBrowser?.then(browser => browser.close()).catch(() => {}); defaultBrowser = null;
  browserOrigins.clear();
};
