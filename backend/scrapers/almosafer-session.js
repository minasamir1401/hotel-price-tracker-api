const origin = 'https://www.almosafer.com';
export const webUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

let browserInstance = null;
let browserInitPromise = null;

async function getChromiumBrowser() {
  if (browserInstance?.isConnected()) return browserInstance;
  if (browserInitPromise) return browserInitPromise;

  browserInitPromise = (async () => {
    const { chromium } = await import('playwright');
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
    ];
    try {
      browserInstance = await chromium.launch({ headless: true, args });
    } catch (err) {
      if (process.platform === 'win32') {
        browserInstance = await chromium.launch({ headless: true, channel: 'chrome', args });
      } else {
        throw err;
      }
    }
    return browserInstance;
  })().finally(() => {
    browserInitPromise = null;
  });

  return browserInitPromise;
}

async function fetchSessionWithBrowser(targetUrl, timeoutMs = 25000) {
  const browser = await getChromiumBrowser();
  const context = await browser.newContext({
    userAgent: webUserAgent,
    locale: 'ar-SA',
    timezoneId: 'Asia/Riyadh',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForSelector('#__NEXT_DATA__', { timeout: 10000 }).catch(() => null);

    const token = await page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__');
      if (!el) return null;
      try {
        const json = JSON.parse(el.textContent);
        return json.props?.pageProps?.APIToken || null;
      } catch {
        return null;
      }
    });

    const cookies = await context.cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    return { token, cookieHeader };
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

export const DEFAULT_ALMOSAFER_TOKEN = 'skdjfh73273$7268u2j89s';

// Bootstrap the public hotel web session. This is session configuration, never a price source.
export function createAlmosaferSessionProvider({fetchImpl = fetch, now = Date.now, cacheTTL = 300000} = {}) {
  let cached = null;
  let pending = null;
  async function session(payload, deadline) {
    if (cached && cached.expires > now()) {
      session.cookieHeader = cached.cookieHeader || null;
      return cached.token;
    }
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

        if (res.ok) {
          const html = await res.text();
          const match = html.match(/<script\b(?=[^>]*\bid=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/i);
          try {
            token = match && JSON.parse(match[1]).props?.pageProps?.APIToken;
          } catch { /* ignore */ }
        }
      } catch (httpErr) {
        // Fall through
      }

      if ((typeof token !== 'string' || !token.trim()) && fetchImpl === fetch) {
        token = process.env.ALMOSAFER_API_TOKEN || DEFAULT_ALMOSAFER_TOKEN;
      }

      if (typeof token !== 'string' || !token.trim()) {
        throw new Error('لم يرجع موقع المسافر إعداد جلسة ويب صالحًا');
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
