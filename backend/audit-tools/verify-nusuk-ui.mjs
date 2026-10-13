import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as XLSX from '../../frontend/node_modules/xlsx/xlsx.mjs';

const hotelInput = process.argv.includes('--hotel-url') ? process.argv[process.argv.indexOf('--hotel-url') + 1] : null;
const out = path.resolve('outputs/nusuk-app-probe/ui', hotelInput ? new URL(hotelInput).pathname.split('/').pop() : '.');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chromium' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
const page = await context.newPage();
const requests = [], pending = [];
let result;
page.on('request', request => {
  if (request.url().includes('/api/') && request.method() === 'POST') requests.push({ path: new URL(request.url()).pathname, body: request.postDataJSON() });
});
page.on('response', response => {
  if (!response.url().includes('/api/search-jobs/')) return;
  pending.push((async () => { const body = await response.json(); if (body.result?.data?.length) result = body.result; })());
});
try {
  const url = new URL('http://127.0.0.1:5177');
  url.search = new URLSearchParams({ source: hotelInput ? 'almatar' : 'nusuk', ...(hotelInput ? {} : { hotel: 'https://almatar.com/ar/hotels/rooms/mecca-m-hotel-al-dana-makkah-millennium-1660326/' }), checkIn: '2026-10-20', checkOut: '2026-10-21' });
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
  if (hotelInput) {
    await page.getByPlaceholder('رابط الفندق من المسافر أو المطار أو Booking، أو booking:184752').evaluate((element, text) => {
      const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', text);
      element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
    }, hotelInput);
  }
  const source = page.getByRole('button', { name: /نسك Nusuk/ });
  assert.equal(await source.getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'بحث واستخراج الأسعار المباشرة' }).click();
  await page.locator('#selected-room').waitFor({ timeout: 60000 });
  await Promise.allSettled(pending);
  assert(result?.data?.length > 0);
  assert(requests.some(request => request.path === '/api/search-hotel-prices' && request.body.sources?.includes('nusuk')));
  assert(!requests.some(request => request.path === '/api/daily-prices'));
  assert(result.data.every(room => room.source === 'Nusuk'));
  if (hotelInput) {
    assert(requests.some(request => request.path === '/api/hotel-rooms-list' && request.body.source === 'nusuk' && request.body.hotelInput === hotelInput));
    const quotes = result.data.flatMap(room => room.dailyRates.flatMap(day => Object.values(day.offers)));
    assert(quotes.length > 0);
    assert(quotes.every(quote => String(quote.hotelId) === hotelInput.match(/-(\d+)$/)[1]));
    assert(!await page.getByText('يرجى إدخال رابط الفندق من المطار لتحديد الفندق بدقة', { exact: true }).count());
  }
  const roomId = await page.locator('#selected-room').inputValue();
  const selected = result.data.find(room => room.id === roomId) || result.data[0];
  const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
  const exportButton = page.getByRole('button', { name: /تصدير.*Excel|تصدير.*إكسل|تحميل.*Excel/ }).first();
  await exportButton.click();
  const download = await downloadPromise;
  const file = path.join(out, 'nusuk-ui-export.xlsx');
  await download.saveAs(file);
  const workbook = XLSX.read(await fs.readFile(file), { type: 'buffer' });
  const cells = Object.values(workbook.Sheets).flatMap(sheet => XLSX.utils.sheet_to_json(sheet, { header: 1 }).flat());
  for (const quote of Object.values(selected.dailyRates[0].offers)) assert(cells.includes(quote.price));
  await page.locator('#selected-room').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, 'nusuk-results.png'), fullPage: true });
  await fs.writeFile(path.join(out, 'website-result.json'), JSON.stringify(result, null, 2));
  await fs.writeFile(path.join(out, 'requests.json'), JSON.stringify(requests, null, 2));
  const report = { checkedAt: new Date().toISOString(), websiteSource: 'Nusuk', hotelInput, pastedUrlAutoSelectedNusuk: Boolean(hotelInput), roomTypes: result.data.length,
    usedNusukComparisonEndpoint: true, noAlmatarDailyRoute: true, actualBrowserExcelDownloadVerified: true,
    emulatorUsed: false, mobileAppScreenCompared: false };
  await fs.writeFile(path.join(out, 'verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  await fs.writeFile(path.join(out, 'failed-page.txt'), await page.locator('body').innerText());
  await fs.writeFile(path.join(out, 'requests.json'), JSON.stringify(requests, null, 2));
  await page.screenshot({ path: path.join(out, 'failed-page.png'), fullPage: true });
  throw error;
} finally { await browser.close(); }
