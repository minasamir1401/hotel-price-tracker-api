import fs from 'node:fs/promises';
import path from 'node:path';
import { createDailyPricesFetcher } from './daily-prices-almatar.js';
import { createAlmatarClient } from './scrapers/almatar-client.js';

const directory = path.resolve('outputs/almarwa-october-2026');
await fs.mkdir(directory, { recursive: true });
let serial = 0;
const auditedFetch = async (url, options) => {
  const id = ++serial;
  const response = await fetch(url, options);
  const body = await response.clone().json();
  await fs.writeFile(path.join(directory, `raw-${String(id).padStart(3, '0')}.json`), JSON.stringify({ fetchedAt: new Date().toISOString(), url, request: JSON.parse(options.body), status: response.status, response: body }, null, 2));
  console.log(`Request ${id}: ${JSON.parse(options.body).req.fd}, HTTP ${response.status}, complete=${body.data?.isSearchCompleted}`);
  return response;
};
const fetchPrices = createDailyPricesFetcher({ queryImpl: createAlmatarClient({ fetchImpl: auditedFetch }) });
const result = await fetchPrices({
  hotelInput: 'https://almatar.com/ar/hotels/rooms/mecca-al-marwa-rayhaan-by-rotana-makkah-133550/',
  checkIn: '2026-10-01', checkOut: '2026-11-01', adults: 2, rooms: 1,
  roomName: 'غرفة واسعة بسرير توأم', roomKeywords: [], bedCount: 2, bedType: 'single', mealPlan: '', concurrency: 4,
});
await fs.writeFile(path.join(directory, 'prices.json'), JSON.stringify({ success: true, ...result }, null, 2));
await fs.writeFile(path.resolve('frontend/public/almarwa-october-2026.json'), JSON.stringify({ success: true, ...result }, null, 2));
const csv = ['التاريخ,اليوم,إقامة فقط (ريال),إقامة وإفطار (ريال),إفطار + غداء أو عشاء (ريال),سياسة إلغاء الإفطار,معرف باقة الإفطار', ...result.rows.map(row => [row.date, row.dayName, row.roomOnly, row.breakfast, row.halfBoard, row.dayStatus, row.offers.breakfast?.packageId || ''].join(','))].join('\r\n');
await fs.writeFile(path.join(directory, 'prices.csv'), '\uFEFF' + csv);
console.log(JSON.stringify({ fetchedAt: result.fetchedAt, available: result.rows.filter(row => row.offers.breakfast).length, failed: result.rows.filter(row => row.error).length, rows: result.rows.map(row => ({ date: row.date, price: row.breakfast, status: row.dayStatus })) }, null, 2));
