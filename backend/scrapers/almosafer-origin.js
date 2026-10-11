const allowedOrigins = new Set(['https://www.almosafer.com', 'https://global.almosafer.com']);

export function almosaferOrigin(value = process.env.ALMOSAFER_ORIGIN || 'https://www.almosafer.com') {
  let origin;
  try { origin = new URL(value).origin; } catch { /* invalid configuration */ }
  if (!allowedOrigins.has(origin)) throw new Error('دومين المسافر غير مدعوم؛ استخدم www.almosafer.com أو global.almosafer.com عبر HTTPS');
  return origin;
}

export function almosaferInputOrigin(input) {
  try {
    const host = new URL(input).hostname;
    if (host === 'global.almosafer.com') return 'https://global.almosafer.com';
    if (host === 'www.almosafer.com' || host === 'almosafer.com') return 'https://www.almosafer.com';
  } catch { /* names and IDs use the configured default */ }
  return almosaferOrigin();
}
