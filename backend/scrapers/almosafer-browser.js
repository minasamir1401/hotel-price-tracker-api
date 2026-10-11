import { chromium } from 'playwright';
import fs from 'node:fs';

const FALLBACK_TOKEN = process.env.ALMOSAFER_API_TOKEN?.trim() || '4R!eVj7$&7Q8Duhv1#pB';
const REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

let cachedSession = {
  token: FALLBACK_TOKEN,
  cookieHeader: null,
  expiresAt: Date.now() + REFRESH_INTERVAL_MS,
  lastUpdated: Date.now(),
};

let activeBrowserFetch = null;
let refreshTimer = null;

function resolveBrowserLaunchOptions() {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--no-zygote',
    '--single-process',
    '--disable-extensions',
  ];

  if (process.env.PLAYWRIGHT_CHROME_PATH && fs.existsSync(process.env.PLAYWRIGHT_CHROME_PATH)) {
    return { executablePath: process.env.PLAYWRIGHT_CHROME_PATH, headless: true, args };
  }

  // Common Windows Chrome path
  const winChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (process.platform === 'win32' && fs.existsSync(winChrome)) {
    return { executablePath: winChrome, headless: true, args };
  }

  // Default Playwright bundled / system Chromium for Linux / Docker
  return { headless: true, args };
}

export async function fetchAlmosaferTokenViaBrowser({ hotelId = '1287944', origin = 'https://www.almosafer.com' } = {}) {
  let browser = null;
  try {
    const launchOpts = resolveBrowserLaunchOptions();
    browser = await chromium.launch(launchOpts);

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      extraHTTPHeaders: {
        'Accept-Language': 'ar,en;q=0.9',
      },
    });

    const page = await context.newPage();
    const targetUrl = hotelId
      ? `${origin}/ar/hotel/details/atg/hotel-${encodeURIComponent(hotelId)}`
      : `${origin}/ar/hotels-home`;

    await page.goto(targetUrl, { timeout: 35000, waitUntil: 'domcontentloaded' });

    const extracted = await page.evaluate(() => {
      try {
        const next = window.__NEXT_DATA__;
        return {
          token: next?.props?.pageProps?.APIToken || null,
        };
      } catch {
        return { token: null };
      }
    });

    const cookies = await context.cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ') || null;

    if (extracted.token && typeof extracted.token === 'string') {
      cachedSession = {
        token: extracted.token.trim(),
        cookieHeader,
        expiresAt: Date.now() + REFRESH_INTERVAL_MS,
        lastUpdated: Date.now(),
      };
      return cachedSession;
    }

    if (cookieHeader) cachedSession.cookieHeader = cookieHeader;
    return cachedSession;
  } catch (err) {
    console.warn('[ALMOSAFER BROWSER] Failed to fetch token via browser:', err.message);
    return cachedSession;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

export async function getAlmosaferSession({ hotelId, origin = 'https://www.almosafer.com', forceRefresh = false } = {}) {
  const isExpired = Date.now() >= cachedSession.expiresAt;
  if (!forceRefresh && !isExpired && cachedSession.token) {
    return cachedSession;
  }

  if (activeBrowserFetch) {
    return activeBrowserFetch;
  }

  activeBrowserFetch = fetchAlmosaferTokenViaBrowser({ hotelId, origin })
    .finally(() => {
      activeBrowserFetch = null;
    });

  return activeBrowserFetch;
}

export function startAlmosaferTokenScheduler() {
  if (refreshTimer) return;

  // Run initial background refresh
  getAlmosaferSession({ forceRefresh: true }).catch(err => {
    console.warn('[ALMOSAFER SCHEDULER] Initial refresh error:', err.message);
  });

  refreshTimer = setInterval(() => {
    getAlmosaferSession({ forceRefresh: true }).catch(err => {
      console.warn('[ALMOSAFER SCHEDULER] Scheduled refresh error:', err.message);
    });
  }, REFRESH_INTERVAL_MS);

  if (refreshTimer.unref) refreshTimer.unref();
}

export function getCachedAlmosaferSession() {
  return cachedSession;
}
