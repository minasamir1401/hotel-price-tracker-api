import { chromium } from 'playwright';
import fs from 'node:fs';

export function resolveBrowserLaunchOptions() {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--no-zygote',
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

const bookingUrlCache = new Map();

export async function resolveBookingHotelIdViaBrowser(url) {
  const normalized = String(url || '').split('?')[0].toLowerCase();
  if (bookingUrlCache.has(normalized)) {
    return bookingUrlCache.get(normalized);
  }

  let browser = null;
  try {
    const launchOpts = resolveBrowserLaunchOptions();
    browser = await chromium.launch(launchOpts);
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      extraHTTPHeaders: { 'Accept-Language': 'ar,en;q=0.9' },
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
    try {
      await page.waitForNavigation({ timeout: 10000 });
    } catch {}

    const hotelId = await page.evaluate(() => {
      return window.booking?.env?.b_hotel_id ||
        window.b_hotel_id ||
        document.querySelector('[data-hotel-id]')?.getAttribute('data-hotel-id') ||
        document.querySelector('[data-hotelid]')?.getAttribute('data-hotelid') ||
        document.querySelector('input[name="hotel_id"]')?.value ||
        null;
    });

    if (hotelId && /^[1-9]\d*$/.test(String(hotelId))) {
      const result = String(hotelId);
      bookingUrlCache.set(normalized, result);
      return result;
    }

    const html = await page.content();
    const match = html.match(/b_hotel_id\s*[:=]\s*['"]?([1-9]\d*)/) || html.match(/data-hotelid=['"]([1-9]\d*)/);
    if (match?.[1]) {
      bookingUrlCache.set(normalized, match[1]);
      return match[1];
    }
    return null;
  } catch (err) {
    console.warn('[BOOKING BROWSER] Failed to resolve hotel ID via browser:', err.message);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
