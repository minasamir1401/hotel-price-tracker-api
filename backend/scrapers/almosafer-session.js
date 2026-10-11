import { almosaferOrigin } from './almosafer-origin.js';
export const webUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

import { upstreamHttpError, UpstreamError } from './upstream-error.js';

// Bootstrap the public hotel web session. This is session configuration, never a price source.
export function createAlmosaferSessionProvider({fetchImpl = fetch, now = Date.now, cacheTTL = 300000, origin = almosaferOrigin()} = {}) {
  origin = almosaferOrigin(origin);
  let cached = null;
  let pending = null;
  async function session(payload, deadline) {
    if (cached && cached.expires > now()) {
      session.cookieHeader = cached.cookieHeader || null;
      return cached.token;
    }
    if (pending) return pending;
    pending = (async () => {
      const url = new URL(payload.hotelId ? `/ar/hotel/details/atg/hotel-${encodeURIComponent(payload.hotelId)}` : '/ar/hotels-home', origin);
      const dmy = iso => iso.split('-').reverse().join('-');
      if (payload.checkIn) url.searchParams.set('checkin', dmy(payload.checkIn));
      if (payload.checkOut) url.searchParams.set('checkout', dmy(payload.checkOut));
      url.searchParams.set('rooms', (payload.roomsInfo || [{ adultsCount: 2, kidsAges: [] }]).map(r => r.kidsAges.length
        ? `${r.adultsCount}_adult,${r.kidsAges.length}_child,${r.kidsAges.join('-')}_age`
        : `${r.adultsCount}_adult`).join('*'));
      url.searchParams.set('ncr', '1');
      const remaining = deadline - now();
      if (remaining <= 0) throw new Error('انتهت مهلة تهيئة جلسة المسافر');

      let token = null;
      let cookieHeader = null;

      try {
        const res = await fetchImpl(url.href, {
          headers: {
            'User-Agent': webUserAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'max-age=0',
            'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'none',
            'sec-fetch-user': '?1',
            'upgrade-insecure-requests': '1',
          },
          signal: AbortSignal.timeout(Math.min(20000, remaining)),
        });

        if (!res.ok) throw await upstreamHttpError(res, { stage: 'session-bootstrap', url: url.href });
        if (res.ok) {
          const cookies = res.headers?.getSetCookie?.() || [];
          cookieHeader = cookies.map(cookie => cookie.split(';')[0]).join('; ') || null;
          const html = await res.text();
          const match = html.match(/<script\b(?=[^>]*\bid=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/i);
          try {
            token = match && JSON.parse(match[1]).props?.pageProps?.APIToken;
          } catch { /* ignore */ }
        }
      } catch (httpErr) {
        if (httpErr instanceof UpstreamError) throw httpErr;
        throw new UpstreamError('تعذر تهيئة جلسة المسافر: فشل الاتصال بالمصدر', { source: 'almosafer', stage: 'session-bootstrap', code: 'UPSTREAM_NETWORK_ERROR' });
      }

      if (typeof token !== 'string' || !token.trim()) {
        throw new UpstreamError('لم يرجع موقع المسافر إعداد جلسة ويب صالحًا', { source: 'almosafer', stage: 'session-bootstrap', code: 'UPSTREAM_SESSION_MISSING' });
      }

      session.cookieHeader = cookieHeader;
      cached = { token, cookieHeader, expires: now() + cacheTTL };
      return token;
    })().finally(() => { pending = null; });
    return pending;
  }
  session.cookieHeader = null;
  session.invalidate = () => {
    cached = null;
    session.cookieHeader = null;
  };
  return session;
}
