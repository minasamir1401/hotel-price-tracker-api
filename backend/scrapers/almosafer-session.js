const origin = 'https://www.almosafer.com';
export const webUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// Bootstrap the public hotel web session. This is session configuration, never a price source.
export function createAlmosaferSessionProvider({fetchImpl = fetch, now = Date.now, cacheTTL = 300000} = {}) {
  let cached = null;
  let pending = null;
  async function session(payload, deadline) {
    if (cached && cached.expires > now()) return cached.token;
    if (pending) return pending;
    pending = (async () => {
      const url = new URL(`/ar/hotel/details/atg/hotel-${encodeURIComponent(payload.hotelId)}`, origin);
      const dmy = iso => iso.split('-').reverse().join('-');
      url.searchParams.set('checkin', dmy(payload.checkIn));
      url.searchParams.set('checkout', dmy(payload.checkOut));
      url.searchParams.set('rooms', payload.roomsInfo.map(r => r.kidsAges.length
        ? `${r.adultsCount}_adult,${r.kidsAges.length}_child,${r.kidsAges.join('-')}_age`
        : `${r.adultsCount}_adult`).join('*'));
      url.searchParams.set('ncr', '1');
      const remaining = deadline - now();
      if (remaining <= 0) throw new Error('انتهت مهلة تهيئة جلسة المسافر');
      const res = await fetchImpl(url.href, {
        headers: {'User-Agent': webUserAgent, Accept: 'text/html'},
        signal: AbortSignal.timeout(Math.min(20000, remaining)),
      });
      if (!res.ok) throw new Error(`تعذر تهيئة جلسة المسافر: HTTP ${res.status}`);
      const html = await res.text();
      const match = html.match(/<script\b(?=[^>]*\bid=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/i);
      let token;
      try { token = match && JSON.parse(match[1]).props?.pageProps?.APIToken; } catch { /* fail closed below */ }
      if (typeof token !== 'string' || !token.trim()) throw new Error('لم يرجع موقع المسافر إعداد جلسة ويب صالحًا');
      cached = {token, expires: now() + cacheTTL};
      return token;
    })().finally(() => { pending = null; });
    return pending;
  }
  session.invalidate = () => { cached = null; };
  return session;
}
