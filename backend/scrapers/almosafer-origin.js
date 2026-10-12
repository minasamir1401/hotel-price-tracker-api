const allowedOrigins = new Set(['https://www.almosafer.com', 'https://global.almosafer.com']);

export function almosaferOrigin(value = process.env.ALMOSAFER_ORIGIN || 'https://www.almosafer.com') {
  let origin;
  try { origin = new URL(value).origin; } catch { /* invalid configuration */ }
  if (!allowedOrigins.has(origin)) throw new Error('دومين المسافر غير مدعوم؛ استخدم www.almosafer.com أو global.almosafer.com عبر HTTPS');
  return origin;
}

export function almosaferInputOrigin(input, env = process.env) {
  try {
    const host = new URL(input).hostname;
    if (['almosafer.com','global.almosafer.com','www.almosafer.com'].includes(host) &&
        env.ALMOSAFER_BROWSER_ORIGIN && (Boolean(env.ALMOSAFER_BROWSER_WS_ENDPOINT) || env.ALMOSAFER_HTTP_TRANSPORT === 'browser')) {
      return almosaferOrigin(env.ALMOSAFER_BROWSER_ORIGIN);
    }
    if (host === 'global.almosafer.com') return 'https://global.almosafer.com';
    if (host === 'www.almosafer.com' || host === 'almosafer.com') return 'https://www.almosafer.com';
  } catch { /* names and IDs use the configured default */ }
  return almosaferOrigin(env.ALMOSAFER_BROWSER_ORIGIN &&
    (Boolean(env.ALMOSAFER_BROWSER_WS_ENDPOINT) || env.ALMOSAFER_HTTP_TRANSPORT === 'browser') ? env.ALMOSAFER_BROWSER_ORIGIN : undefined);
}
