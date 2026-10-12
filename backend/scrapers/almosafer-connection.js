// Operator configuration only. Never log proxy addresses or credentials.
export function almosaferConnection(env = process.env) {
  const browserEndpoint = (env.ALMOSAFER_BROWSER_WS_ENDPOINT || '').trim();
  const selected = env.ALMOSAFER_HTTP_TRANSPORT || (browserEndpoint ? 'brightdata' : null);
  if (selected === 'brightdata') {
    let endpoint;
    try { endpoint = new URL(browserEndpoint); } catch { throw new Error('يلزم إعداد ALMOSAFER_BROWSER_WS_ENDPOINT لاتصال Bright Data'); }
    if (endpoint.protocol !== 'wss:' || endpoint.hostname !== 'brd.superproxy.io' || endpoint.port !== '9222' ||
        !endpoint.username || !endpoint.password || endpoint.search || endpoint.hash || !['','/'].includes(endpoint.pathname)) {
      throw new Error('إعداد اتصال Bright Data غير صالح؛ استخدم Browser API عبر WSS والمنفذ 9222');
    }
    return { transport: 'brightdata', browserEndpoint, proxyUrl: '', proxy: undefined, headless: true,
      browserFallback: false, idleMs: 30000, requestTimeoutMs: 150000, concurrency: 2 };
  }
  const raw = env.ALMOSAFER_PROXY_URL ?? '';
  const proxyUrl = raw.trim();
  let proxy;
  if (proxyUrl) {
    let url;
    try { url = new URL(proxyUrl); } catch {
      throw new Error('إعداد ALMOSAFER_PROXY_URL غير صالح؛ استخدم بروكسي HTTP/HTTPS أو SOCKS5 بدون مصادقة');
    }
    if (!['http:', 'https:', 'socks5:'].includes(url.protocol) || !url.hostname ||
        url.pathname !== '/' || url.search || url.hash) {
      throw new Error('إعداد ALMOSAFER_PROXY_URL غير صالح؛ استخدم بروكسي HTTP/HTTPS أو SOCKS5 بدون مصادقة');
    }
    if (url.protocol === 'socks5:' && (url.username || url.password)) {
      throw new Error('إعداد ALMOSAFER_PROXY_URL غير صالح؛ استخدم بروكسي HTTP/HTTPS أو SOCKS5 بدون مصادقة');
    }
    proxy = { server: `${url.protocol}//${url.host}`,
      ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
      ...(url.password ? { password: decodeURIComponent(url.password) } : {}) };
  }
  const transport = selected || (proxyUrl ? 'browser' : 'native');
  if (!['native', 'curl', 'browser'].includes(transport)) throw new Error('إعداد ALMOSAFER_HTTP_TRANSPORT غير صالح');
  if (proxyUrl && transport === 'native') throw new Error('استخدم curl أو browser مع ALMOSAFER_PROXY_URL؛ الاتصال المباشر لا يدعم هذا البروكسي');
  return { transport, proxyUrl, proxy, headless: env.ALMOSAFER_BROWSER_HEADLESS !== '0',
    browserFallback: env.ALMOSAFER_BROWSER_FALLBACK === '1', idleMs: 600000, requestTimeoutMs: 20000, concurrency: 8 };
}
