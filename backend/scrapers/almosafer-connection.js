// Operator configuration only. Never log proxy addresses or credentials.
export function almosaferConnection(env = process.env) {
  const proxyUrl = env.ALMOSAFER_PROXY_URL?.trim() || '';
  let proxy;
  if (proxyUrl) {
    try {
      const url = new URL(proxyUrl);
      if (!['http:', 'https:', 'socks5:'].includes(url.protocol) || !url.hostname ||
          url.pathname !== '/' || url.search || url.hash) throw new Error();
      if (url.protocol === 'socks5:' && (url.username || url.password)) throw new Error();
      proxy = { server: `${url.protocol}//${url.host}`,
        ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
        ...(url.password ? { password: decodeURIComponent(url.password) } : {}) };
    } catch {
      throw new Error('إعداد ALMOSAFER_PROXY_URL غير صالح؛ استخدم بروكسي HTTP/HTTPS أو SOCKS5 بدون مصادقة');
    }
  }
  const transport = env.ALMOSAFER_HTTP_TRANSPORT || (proxyUrl ? 'browser' : 'native');
  if (!['native', 'curl', 'browser'].includes(transport)) throw new Error('إعداد ALMOSAFER_HTTP_TRANSPORT غير صالح');
  if (proxyUrl && transport === 'native') throw new Error('استخدم curl أو browser مع ALMOSAFER_PROXY_URL؛ الاتصال المباشر لا يدعم هذا البروكسي');
  return { transport, proxyUrl, proxy, browserFallback: env.ALMOSAFER_BROWSER_FALLBACK === '1', idleMs: 600000 };
}
