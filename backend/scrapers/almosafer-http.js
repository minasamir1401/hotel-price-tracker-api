import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { almosaferOrigin } from './almosafer-origin.js';
import { almosaferConnection } from './almosafer-connection.js';
import { isChallengeResponse } from './challenge-response.js';

export const webUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const workerPath = fileURLToPath(new URL('./almosafer-http-worker.py', import.meta.url));

// One public cookie jar per origin, with concurrent requests and bounded deadlines.
export function createCurlFetch({ python = process.env.ALMOSAFER_PYTHON || 'python', spawnImpl = spawn, idleMs = 600000 } = {}) {
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

export function createAlmosaferFetch({ env = process.env, nativeFetch = fetch, createCurl = createCurlFetch,
  createBrowser = async () => (await import('./almosafer-browser-http.js')).createAlmosaferBrowserFetch({env}),
  createScrapingAnt = async () => {
    const { createScrapingAntFetch } = await import('./scrapingant-fetch.js');
    const { createKeyPool } = await import('./scrapingant-keys.js');
    return createScrapingAntFetch({ keyPool: createKeyPool({ env }) });
  } } = {}) {
  let curl, browser, handoff, handoffPending, scrapingAnt;
  const browserOrigins = new Set();
  const getBrowser = () => {
    browser ||= Promise.resolve().then(createBrowser).catch(error => { browser = null; throw error; });
    return browser;
  };
  const transport = async (url, options) => {
    const origin = almosaferOrigin(new URL(url).origin);
    const connection = almosaferConnection(env);
    if (connection.transport === 'scrapingant') {
      scrapingAnt ||= await createScrapingAnt();
      return scrapingAnt(url, options);
    }
    if(connection.remote && env.ALMOSAFER_DIRECT_AFTER_BOOTSTRAP!=='0') {
      handoffPending ||= Promise.resolve().then(async()=>{
        const {createAlmosaferHandoff}=await import('./almosafer-handoff.js');
        // Docker already provides curl_cffi. Use its browser TLS/HTTP2 profile
        // with the exported guest cookies instead of Node's TLS fingerprint.
        const directTransport=env.ALMOSAFER_HANDOFF_HTTP_TRANSPORT || 'curl';
        if(!['curl','native'].includes(directTransport))throw new Error('إعداد ALMOSAFER_HANDOFF_HTTP_TRANSPORT غير صالح');
        const directFetch=directTransport==='curl'
          ? (curl ||= createCurl({python:env.ALMOSAFER_PYTHON || undefined})) : nativeFetch;
        handoff=createAlmosaferHandoff({browserFetch:await getBrowser(),directFetch,directTransport});
        return handoff;
      }).catch(error=>{handoffPending=null;throw error;});
      return (await handoffPending)(url,options);
    }
    if (connection.transport === 'browser' || browserOrigins.has(origin)) return (await getBrowser())(url, options);
    let response;
    if (connection.transport === 'curl') {
      curl ||= createCurl();
      response = await curl(url, options);
    } else response = await nativeFetch(url, options);
    if (!connection.browserFallback || !(await isChallengeResponse(response))) return response;
    try {
      const result = await (await getBrowser())(url, options);
      // Stay in this browser even if the source still requires verification.
      browserOrigins.add(origin);
      return result;
    } catch {
      options?.signal?.throwIfAborted();
      return response;
    }
  };
  transport.close = async () => {
    handoff?.clear();handoff=null;handoffPending=null;
    curl?.close(); curl = null;
    await scrapingAnt?.close?.(); scrapingAnt = null;
    const previous = browser; browser = null;
    browserOrigins.clear();
    await previous?.then(client => client.close()).catch(() => {});
  };
  transport.diagnostics=()=>{
    const conn=almosaferConnection(env);
    if(conn.transport==='scrapingant') {
      return { transport: 'scrapingant', ...(scrapingAnt?.keyPool?.diagnostics?.() || {}) };
    }
    return handoff?.snapshot() || {directAfterBootstrap:Boolean(conn.remote) && env.ALMOSAFER_DIRECT_AFTER_BOOTSTRAP!=='0',directTransport:env.ALMOSAFER_HANDOFF_HTTP_TRANSPORT || 'curl',state:'unchecked',reason:null,bootstrapRequests:0,directRequests:0,browserApiRequests:0};
  };
  return transport;
}

// Configuration is evaluated after server.js loads its local .env files.
export const almosaferFetch = createAlmosaferFetch();
