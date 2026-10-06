import fs from 'node:fs/promises';
import { createDailyPricesFetcher } from './daily-prices-almatar.js';
import { createAlmatarClient } from './scrapers/almatar-client.js';
const directory = 'outputs/almarwa-2026-10-06';
await fs.mkdir(directory, { recursive: true });
let serial = 0;
const auditedFetch = async (url, options) => {
  const response = await fetch(url, options);
  const packet = await response.clone().json();
  await fs.writeFile(`${directory}/raw-${++serial}.json`, JSON.stringify({ fetchedAt: new Date().toISOString(), url, request: JSON.parse(options.body), status: response.status, response: packet }, null, 2));
  return response;
};
const result = await createDailyPricesFetcher({ queryImpl: createAlmatarClient({ fetchImpl: auditedFetch }) })({
  hotelInput: 'https://almatar.com/ar/hotels/rooms/mecca-al-marwa-rayhaan-by-rotana-makkah-133550/',
  checkIn: '2026-10-06', checkOut: '2026-10-07', adults: 2, rooms: 1, roomName: 'غرفة واسعة بسرير توأم', bedCount: 2, bedType: 'single', mealPlan: 'breakfast',
});
await fs.writeFile(`${directory}/prices.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
