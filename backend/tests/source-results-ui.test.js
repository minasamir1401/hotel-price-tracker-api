// Build frontend first, then run: node backend/tests/source-results-ui.test.js
// Exercises the real React app and normalizer using fixtures, never supplier APIs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {createLiveScraper} from '../scrapers/almosafer-live.js';
import {executeHotelComparison} from '../scrapers/index.js';

const requireFrontend = createRequire(new URL('../../frontend/package.json', import.meta.url));
const XLSX = requireFrontend('xlsx');
const sources = [
  ['almosafer', 'Almosafer', 'المسافر', 'https://www.almosafer.com/ar/hotel/details/atg/test-hotel-1234567'],
  ['almatar', 'Almatar', 'المطار', 'https://almatar.com/ar/hotels/rooms/test-hotel-1660326/'],
  ['booking', 'Booking', 'بوكينج', 'booking:184752'],
  ['nusuk', 'Nusuk', 'نسك', 'https://almatar.com/ar/hotels/rooms/test-hotel-1660326/'],
];
const roomName = source => `غرفة تحقق ${source}`;

test('All four sources use the shared room picker, daily table, Excel and retry flow without losing explicit selections', async () => {
  const root = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
  const output = fileURLToPath(new URL('../../outputs/source-results-ui/', import.meta.url));
  const recovered = new Set();
  const engines = Object.fromEntries(sources.map(([key, source, sourceArabic], index) => [key,
    createLiveScraper(async () => ({hotelId:String(100 + index), hotelName:'فندق اختبار العرض', baseSlug:'test-hotel'}),
      async params => params.checkIn === '2027-02-01' && !recovered.has(key) ? {} : ({standard:{name:roomName(sourceArabic), beds:[], offers:{
        roomOnly:{price:500 + index * 100 + Number(params.checkIn.slice(-2)), packageId:`${key}-${params.checkIn}`},
        breakfast:{price:550 + index * 100 + Number(params.checkIn.slice(-2)), packageId:`${key}-bb-${params.checkIn}`},
      }}}), {source, sourceArabic}),
  ]));
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      const path = resolve(root, pathname === '/' ? 'index.html' : `.${pathname}`);
      if (!path.startsWith(`${resolve(root)}\\`) && !path.startsWith(`${resolve(root)}/`)) throw new Error('Invalid path');
      const content = await readFile(path);
      const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.jpg':'image/jpeg', '.svg':'image/svg+xml'};
      res.writeHead(200, {'Content-Type':types[extname(path)] || 'application/octet-stream'});
      res.end(content);
    } catch {res.writeHead(404); res.end();}
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const requests = [], errors = [];
  let browser, partial = false, malformedPrices = null, malformedRooms = false, brokenStatus = false;
  try {
    browser = await chromium.launch({headless:true});
    const page = await browser.newPage({viewport:{width:1280, height:900}, acceptDownloads:true});
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      const body = route.request().postDataJSON();
      let result;
      if (pathname.endsWith('/system-status')) {
        result = {...Object.fromEntries(sources.map(([key]) => [key, 'unchecked'])), errors:[], ...(brokenStatus ? {lastSearch:{unexpected:true}} : {})};
      } else if (pathname.endsWith('/hotel-rooms-list')) {
        const source = sources.find(([key]) => key === body.source) || sources[0];
        result = {success:true, rooms:[roomName(source[2])],
          roomAvailability:malformedRooms ? [{name:roomName(source[2]), availableNights:1, totalNights:2}] : [], warnings:[],
          hotelName:'فندق اختبار العرض', hotelId:'100', roomInventoryId:`inventory-${source[0]}`};
      } else if (pathname.endsWith('/search-hotel-prices')) {
        requests.push(body);
        if (body.sources.length === 1 && (body.checkOut === '2027-02-02' || body.retryDates?.includes('2027-02-01'))) recovered.add(body.sources[0]);
        result = await executeHotelComparison(body, {...engines,
          ...(partial ? {booking:async () => {throw new Error('تعذر الاتصال ببوكينج في الاختبار');}} : {}),
        });
        if (malformedPrices === 'rates') delete result.data[0].dailyRates;
        if (malformedPrices === 'summary') delete result.summary.dailyBreakdown;
      } else if (pathname.endsWith('/daily-prices')) {
        errors.push('Legacy Almatar endpoint was used');
        result = {success:true, rows:[], fetchedAt:new Date().toISOString()};
      } else result = {success:true};
      await route.fulfill({json:result});
    });
    const openSource = async ([source,,,hotel]) => {
      const url = new URL(`http://127.0.0.1:${server.address().port}/`);
      for (const [key, value] of Object.entries({hotel, source, checkIn:'2027-02-01', checkOut:'2027-02-03'})) url.searchParams.set(key, value);
      await page.goto(url.href);
      await page.getByRole('button', {name:'بحث واستخراج الأسعار المباشرة', exact:true}).waitFor();
    };
    const submit = () => page.getByRole('button', {name:'بحث واستخراج الأسعار المباشرة', exact:true}).click();
    for (const viewport of [{width:1280, height:900}, {width:390, height:844}]) {
      await page.setViewportSize(viewport);
      await openSource(sources[0]);
      const dates = page.locator('input[type="date"]');
      const preset = page.getByRole('button', {name:'62 يوماً', exact:true});
      for (const [checkIn, checkOut] of [['2026-12-01', '2027-02-01'], ['2028-01-01', '2028-03-03']]) {
        await dates.nth(0).fill(checkIn);
        await preset.click();
        assert.equal(await dates.nth(0).inputValue(), checkIn);
        assert.equal(await dates.nth(1).inputValue(), checkOut);
        assert.match(await preset.getAttribute('class'), /bg-blue-600 text-white/);
        await page.getByText('62 ليالٍ', {exact:true}).waitFor();
      }
    }
    await page.setViewportSize({width:1280, height:900});
    for (const source of sources) {
      await openSource(source);
      await submit();
      await page.locator('#selected-room').waitFor();
      assert.deepEqual(requests.at(-1).sources, [source[0]]);
      assert.match(await page.locator('#selected-room').innerText(), new RegExp(source[2]));
      await page.getByRole('heading', {name:`الأسعار اليومية المباشرة — ${source[2]} — ${roomName(source[2])}`, exact:true}).waitFor();
      const downloadEvent = page.waitForEvent('download');
      await page.getByRole('button', {name:/تصدير دليل الأسعار إلى Excel/}).click();
      const download = await downloadEvent;
      const workbook = XLSX.read(await readFile(await download.path()), {type:'buffer'});
      const rows = workbook.SheetNames.flatMap(name => XLSX.utils.sheet_to_json(workbook.Sheets[name], {header:1}));
      assert.ok(rows.some(row => row.some(value => typeof value === 'string' && value.includes(roomName(source[2])))), `${source[1]} Excel includes the selected room`);
      assert.ok(rows.some(row => row.some(value => value === 502 + sources.indexOf(source) * 100)), `${source[1]} Excel retains the source quote`);
      await page.getByRole('button', {name:'إعادة التحقق من يوم 2027-02-01', exact:true}).click();
      await page.waitForFunction(() => document.querySelector('#selected-room')?.textContent.includes('مكتملة 100%'));
      assert.deepEqual(requests.at(-1).sources, [source[0]]);
      if (source[0] === 'almosafer') assert.deepEqual(requests.at(-1).retryDates, ['2027-02-01']);
      else assert.equal(requests.at(-1).checkOut, '2027-02-02');
    }

    // Changing Nusuk to Almatar on the same supported hotel URL clears its room.
    await openSource(sources[3]);
    await page.getByRole('button', {name:roomName('نسك'), exact:true}).waitFor();
    await page.getByRole('button', {name:roomName('نسك'), exact:true}).click();
    await page.getByRole('button', {name:/^المطار Almatar/}).click();
    await page.getByRole('button', {name:/^نسك Nusuk/}).click();
    await submit();
    await page.locator('#selected-room').waitFor();
    assert.deepEqual(requests.at(-1).sources, ['almatar']);
    assert.equal(requests.at(-1).roomName, '');
    assert.deepEqual(requests.at(-1).roomKeywords, []);
    assert.notEqual(requests.at(-1).roomInventoryId, 'inventory-nusuk');

    // Explicitly selecting all sources must survive Booking form submission.
    await openSource(sources[2]);
    await page.getByRole('button', {name:'تحديد الكل', exact:true}).click();
    await submit();
    await page.locator('#selected-room').waitFor();
    assert.deepEqual(requests.at(-1).sources, sources.map(([key]) => key));
    assert.equal(await page.locator('#selected-room option').count(), 4);
    for (const source of sources) {
      const option = page.locator('#selected-room option').filter({hasText:roomName(source[2])});
      await page.locator('#selected-room').selectOption(await option.getAttribute('value'));
      await page.getByRole('heading', {name:`الأسعار اليومية المباشرة — ${source[2]} — ${roomName(source[2])}`, exact:true}).waitFor();
    }
    await page.setViewportSize({width:390, height:844});
    await mkdir(output, {recursive:true});
    await page.locator('#selected-room').locator('..').screenshot({path:resolve(output, 'four-sources-mobile.png')});
    partial = true;
    await page.getByRole('button', {name:'تحديث كل الأسعار من المصدر', exact:true}).click();
    await page.getByRole('alert').filter({hasText:'تعذر الاتصال ببوكينج في الاختبار'}).waitFor();
    assert.equal(await page.locator('#selected-room option').count(), 3);
    assert.deepEqual(errors, []);

    partial = false;
    for (const mode of ['rates', 'summary']) {
      malformedPrices = mode;
      await openSource(sources[0]);
      await submit();
      await page.getByRole('alert').filter({hasText:'وصلت بيانات أسعار غير مكتملة من الخادم.'}).waitFor();
      assert.equal(await page.locator('#selected-room').count(), 0);
      assert.equal(await page.getByRole('button', {name:'بحث واستخراج الأسعار المباشرة', exact:true}).count(), 1);
      malformedPrices = null;
      await page.getByRole('button', {name:'إعادة المحاولة', exact:true}).click();
      await page.locator('#selected-room').waitFor();
    }

    malformedRooms = true;
    await openSource(sources[0]);
    await page.getByText('وصلت بيانات غرف غير مكتملة من الخادم. يرجى تحديث الغرف أو إعادة المحاولة.', {exact:true}).waitFor();
    await page.reload();
    await page.getByText('وصلت بيانات غرف غير مكتملة من الخادم. يرجى تحديث الغرف أو إعادة المحاولة.', {exact:true}).waitFor();
    malformedRooms = false;
    await page.getByRole('button', {name:'تحديث الغرف', exact:true}).click();
    await page.getByRole('button', {name:roomName('المسافر'), exact:true}).waitFor();
    assert.deepEqual(errors, []);

    brokenStatus = true;
    await page.reload();
    await page.getByRole('alert').filter({hasText:'حدث خطأ أثناء جلب الأسعار من الخادم، يرجى المحاولة مرة أخرى لاحقاً.'}).waitFor();
    brokenStatus = false;
    await page.getByRole('button', {name:'إعادة المحاولة', exact:true}).click();
    await page.getByRole('button', {name:'بحث واستخراج الأسعار المباشرة', exact:true}).waitFor();
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(done => server.close(done));
  }
});
