// Operator configuration only. Never log proxy addresses or credentials.
export function almosaferConnection(env = process.env) {
  const browserEndpoint = (env.ALMOSAFER_BROWSER_WS_ENDPOINT || '').trim();
  const selected = env.ALMOSAFER_HTTP_TRANSPORT;
  if (selected && !['native', 'curl', 'browser', 'scrapingant'].includes(selected)) {
    throw new Error('إعداد ALMOSAFER_HTTP_TRANSPORT غير صالح');
  }
  if (selected === 'scrapingant' || (!selected && (env.SCRAPINGANT_API_KEYS || env.SCRAPINGANT_API_KEY))) {
    return { transport: 'scrapingant', proxyUrl: '', proxy: undefined, headless: true,
      browserFallback: false, idleMs: 30000, requestTimeoutMs: 60000, concurrency: 4, remote: false };
  }
  if (browserEndpoint && (!selected || selected === 'browser')) {
    let endpoint;
    try { endpoint = new URL(browserEndpoint); } catch {
      throw new Error('يلزم إعداد ALMOSAFER_BROWSER_WS_ENDPOINT كعنوان WebSocket صالح');
    }
    if (!['ws:', 'wss:'].includes(endpoint.protocol) || !endpoint.hostname ||
        endpoint.search || endpoint.hash || !['', '/'].includes(endpoint.pathname)) {
      throw new Error('إعداد ALMOSAFER_BROWSER_WS_ENDPOINT غير صالح؛ استخدم WebSocket عبر ws:// أو wss://');
    }
    return { transport: 'browser', browserEndpoint, proxyUrl: '', proxy: undefined, headless: true,
      browserFallback: false, idleMs: 30000, requestTimeoutMs: 150000, concurrency: 2, remote: true };
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
  if (!['native', 'curl', 'browser', 'scrapingant'].includes(transport)) throw new Error('إعداد ALMOSAFER_HTTP_TRANSPORT غير صالح');
  if (proxyUrl && transport === 'native') throw new Error('استخدم curl أو browser مع ALMOSAFER_PROXY_URL؛ الاتصال المباشر لا يدعم هذا البروكسي');
  return { transport, proxyUrl, proxy, headless: env.ALMOSAFER_BROWSER_HEADLESS !== '0',
    browserFallback: env.ALMOSAFER_BROWSER_FALLBACK === '1', idleMs: 600000, requestTimeoutMs: 20000, concurrency: 8, remote: false };
}
