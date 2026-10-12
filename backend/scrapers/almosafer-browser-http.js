import { chromium } from 'playwright';
import { almosaferOrigin } from './almosafer-origin.js';
import { resolveBrowserLaunchOptions } from './almosafer-browser.js';
import { almosaferConnection } from './almosafer-connection.js';
import { challengeEvidence, isChallengeResponse } from './challenge-response.js';
import {UpstreamError} from './upstream-error.js';

// Execute public page JavaScript, then keep API traffic inside that same browser context.
// No CAPTCHA clicks, external solver, fabricated tokens, or disabled HTTPS verification.
export function createAlmosaferBrowserFetch({ launch = options => chromium.launch(options), env = process.env, blockResources = true,
  connect = endpoint => chromium.connectOverCDP(endpoint, {timeout: 120000}),
  idleMs = almosaferConnection(env).idleMs } = {}) {
  const sessions = new Map();
  function safeDetail(error) {
    let detail=String(error.message||'').split('\n')[0].replace(/[a-z]+:\/\/[^\s]+/gi,'[url]');
    const endpoint=almosaferConnection(env).browserEndpoint;
    if(endpoint) for(const secret of [new URL(endpoint).username,new URL(endpoint).password].flatMap(v=>[v,decodeURIComponent(v)])) if(secret)detail=detail.replaceAll(secret,'[redacted]');
    return detail.slice(0,220);
  }
  async function release(origin) {
    const pending = sessions.get(origin);
    sessions.delete(origin);
    if (!pending) return;
    const entry = await pending.catch(() => null);
    if (entry) { clearTimeout(entry.idle); await entry.browser.close().catch(() => {}); }
  }
  async function acquire(origin) {
    if (!sessions.has(origin)) {
      const pending = (async () => {
        const { proxy, headless, browserEndpoint } = almosaferConnection(env);
        if (browserEndpoint) {
          let browser;
          try {
            browser = await connect(browserEndpoint);
            const context = browser.contexts()[0] || await browser.newContext();
            return {browser, context, origin, page:null, token:null, booting:null, active:0, idle:null, remote:true, bootstrapBody:null};
          } catch (error) {
            await browser?.close().catch(()=>{});
            const status=error.message?.match(/\b(401|403|407|429|503)\b/)?.[1];
            console.warn('[BRIGHT DATA CONNECTION]',JSON.stringify({status:status || null,reason:error.message?.match(/net::ERR_[A-Z_]+|ECONN[A-Z]+|ETIMEDOUT/)?.[0]||'CONNECT_FAILED',detail:safeDetail(error)}));
            throw new UpstreamError(status==='407'?'Bright Data: بيانات مصادقة Browser API غير صحيحة؛ راجع كلمة مرور المنطقة':'تعذر الاتصال بـ Bright Data؛ راجع بيانات Browser API ورصيد الخدمة',
              {source:'almosafer',stage:'browser-connect',code:status==='407'?'BRIGHTDATA_AUTH_FAILED':'BRIGHTDATA_CONNECTION_FAILED',status:503});
          }
        }
        const options = resolveBrowserLaunchOptions({ headless });
        const browser = await launch({ ...options, timeout: 12000,
          ...(proxy ? { proxy } : {}),
          args: [...options.args, '--disable-blink-features=AutomationControlled'] });
        try {
          const platform = process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64' : 'X11; Linux x86_64';
          const context = await browser.newContext({
            userAgent: `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version()} Safari/537.36`,
            locale: 'ar-SA', viewport: { width: 1280, height: 800 },
            extraHTTPHeaders: { 'Accept-Language': 'ar-SA,ar;q=0.9,en-US;q=0.8,en;q=0.7' },
          });
          if (typeof context.addInitScript === 'function') {
            await context.addInitScript(() => {
              Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
              Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
              window.chrome = { runtime: {} };
              const originalQuery = window.navigator.permissions.query;
              window.navigator.permissions.query = (parameters) =>
                parameters.name === 'notifications'
                  ? Promise.resolve({ state: Notification.permission })
                  : originalQuery(parameters);
            });
          }
          return { browser, context, origin, page: null, token: null, booting: null, active: 0, idle: null };
        } catch (error) { await browser.close().catch(() => {}); throw error; }
      })();
      sessions.set(origin, pending);
      pending.catch(() => { if (sessions.get(origin) === pending) sessions.delete(origin); });
    }
    return sessions.get(origin);
  }
  async function responseWithCookies(entry, body, status, rawHeaders = {}) {
    // Preserve only representation and diagnostic headers. Browser response
    // headers can contain pseudo-headers or decoded Unicode cookie values;
    // source cookies are obtained from the context's cookie jar below.
    const headers = new Headers(Object.entries(rawHeaders).filter(([name]) =>
      ['content-type', 'server', 'cf-ray', 'cf-mitigated', 'retry-after'].includes(name.toLowerCase())));
    const cookies = await entry.context.cookies(entry.pageOrigin || entry.origin);
    for (const cookie of cookies) {
      const value = `${cookie.name}=${cookie.value}; Path=${cookie.path || '/'}; Secure`;
      // Fetch headers use ByteString; the browser still retains any Unicode
      // cookie and sends it itself. Never export unrelated third-party cookies.
      if (/^[\x20-\x7e]+$/.test(value)) headers.append('set-cookie', value);
    }
    return new Response([204, 205, 304].includes(status) ? null : body, { status, headers });
  }
  async function document(entry, url, deadline) {
    if (entry.remote && entry.bootstrapBody && entry.page) return responseWithCookies(entry,entry.bootstrapBody,200,{'content-type':'text/html'});
    if (entry.remote) {
      entry.booting ||= loadDocument(entry,url,deadline).finally(()=>{entry.booting=null;});
      // Each caller consumes its own body, even when bootstrap is shared.
      return (await entry.booting).clone();
    }
    return loadDocument(entry,url,deadline);
  }
  async function loadDocument(entry, url, deadline) {
    const page = await entry.context.newPage();
    let latest;
    const track = response => { if (response.request().isNavigationRequest() && response.frame() === page.mainFrame()) latest = response; };
    page.on('response', track);
    try {
      if (entry.remote && blockResources && typeof page.route === 'function') await page.route('**/*', route => {
        const request=route.request(), host=new URL(request.url()).hostname;
        return ['image','font','media'].includes(request.resourceType()) && !/cloudflare|captcha/i.test(host) ? route.abort() : route.continue();
      });
      latest = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: Math.max(1, Math.min(entry.remote ? 120000 : 12000, deadline - Date.now())) });
      // Automatic page scripts may finish and navigate. An interactive challenge stays blocked.
      await page.waitForFunction(() => Boolean(window.__NEXT_DATA__?.props?.pageProps?.APIToken), null,
        { timeout: Math.max(1, Math.min(entry.remote ? 20000 : 7000, deadline - Date.now())) }).catch(() => {});
      // www/global are both first-party Almosafer origins. Keep subsequent
      // fetches in the actual page origin; arbitrary redirects still fail.
      const pageOrigin = new URL(page.url()).origin;
      almosaferOrigin(pageOrigin);
      entry.pageOrigin = pageOrigin;
      const body = await page.content();
      if (Buffer.byteLength(body) > 8 * 1024 * 1024) throw new Error('Response too large');
      if (!latest) throw new Error('No source response');
      const response = await responseWithCookies(entry, body, latest.status(), await latest.allHeaders());
      if (response.ok && !challengeEvidence(response.headers)) {
        const data = body.match(/<script\b(?=[^>]*\bid=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/i);
        let token;
        try { token = data && JSON.parse(data[1]).props?.pageProps?.APIToken; } catch { /* invalid public page */ }
        if (typeof token === 'string' && token.trim()) {
          entry.token = token;
          if (entry.remote) entry.bootstrapBody=body;
          if (!entry.page) entry.page = page;
        }
      }
      return response;
    } finally {
      page.off('response', track);
      if (entry.page !== page) await page.close().catch(() => {});
    }
  }
  async function browserFetch(url, options = {}) {
    const parsed = new URL(url), origin = almosaferOrigin(parsed.origin);
    if (parsed.username || parsed.password) throw new Error('Invalid source URL');
    options.signal?.throwIfAborted();
    const deadline = Date.now() + almosaferConnection(env).requestTimeoutMs;
    let entry, active = false;
    const onAbort = () => { release(origin).catch(() => {}); };
    options.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      entry = await acquire(origin);
      options.signal?.throwIfAborted();
      clearTimeout(entry.idle);
      entry.active++;
      active = true;
      if (!parsed.pathname.startsWith('/api/')) return await document(entry, parsed.href, deadline);
      if (!entry.page) {
        const boot = async () => {
          const ref = new Headers(options.headers).get('referer');
          const target = ref && new URL(ref).origin === origin ? ref : `${origin}/ar/hotels-home`;
          return document(entry, target, deadline);
        };
        const bootstrap = entry.remote ? await boot() : await (entry.booting ||= boot().finally(()=>{entry.booting=null;}));
        if (!bootstrap.ok || await isChallengeResponse(bootstrap)) return bootstrap;
      }
      if (!entry.page) throw new Error('No valid browser session');
      const headers = Object.fromEntries([...new Headers(options.headers)].filter(([key]) => !/^(sec-|cookie$|user-agent$|origin$|referer$|host$|content-length$|accept-encoding$)/i.test(key)));
      // A fallback or an idle restart created a new source session. Its own
      // token must accompany its cookies, never the previous HTTP token.
      if (entry.token) headers.token = entry.token;
      const result = await entry.page.evaluate(async ({ url, method, headers, body, timeout }) => {
        const response = await fetch(url, { method, headers, body, credentials: 'include', redirect: 'error', signal: AbortSignal.timeout(timeout) });
        const text = await response.text();
        if (new TextEncoder().encode(text).length > 8 * 1024 * 1024) throw new Error('Response too large');
        return { body: text, status: response.status, headers: Object.fromEntries(response.headers) };
      }, { url: new URL(parsed.pathname + parsed.search, entry.pageOrigin || origin).href, method: options.method || 'GET', headers, body: options.body,
        timeout: Math.max(1, deadline - Date.now()) });
      options.signal?.throwIfAborted();
      return await responseWithCookies(entry, result.body, result.status, result.headers);
    } catch (error) {
      if (entry?.remote && entry.browser.isConnected?.() === false) await release(origin);
      console.warn('[ALMOSAFER BROWSER FAILURE]', JSON.stringify({ host: parsed.hostname,
        reason: error.message?.match(/net::ERR_[A-Z_]+/)?.[0] || 'BROWSER_SESSION_FAILED', detail:safeDetail(error) }));
      if(error instanceof UpstreamError)throw error;
      throw new Error('تعذر تحميل جلسة المسافر داخل المتصفح أو انتهت المهلة');
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
      if (active && --entry.active === 0 && sessions.has(origin)) entry.idle = setTimeout(() => {
        sessions.get(origin)?.then(current => { if (current === entry) release(origin).catch(() => {}); }).catch(() => {});
      }, idleMs).unref();
    }
  }
  browserFetch.close = () => Promise.all([...sessions.keys()].map(release));
  // Internal guest-session handoff only. This is never exposed by an HTTP route.
  browserFetch.exportSession = async origin => {
    origin=almosaferOrigin(origin);
    const entry=await sessions.get(origin);
    if(!entry?.page || !entry.token)return null;
    clearTimeout(entry.idle);entry.active++;
    try {
      const actualOrigin=almosaferOrigin(entry.pageOrigin || origin);
      const cookies=await entry.context.cookies(actualOrigin);
      const cookieHeader=cookies.filter(c=>/^[\x20-\x7e]+$/.test(`${c.name}=${c.value}`)).map(c=>`${c.name}=${c.value}`).join('; ');
      const userAgent=await entry.page.evaluate(()=>navigator.userAgent);
      return {origin:actualOrigin,token:entry.token,cookieHeader,userAgent};
    } finally {
      if(--entry.active===0 && sessions.has(origin))entry.idle=setTimeout(()=>{
        sessions.get(origin)?.then(current=>{if(current===entry)release(origin).catch(()=>{});}).catch(()=>{});
      },idleMs).unref();
    }
  };
  return browserFetch;
}
