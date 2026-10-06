import fs from 'node:fs/promises';
import { createDailyPricesFetcher } from './daily-prices-almatar.js';
import { parseAlmatarPackages, toAlmatarPayload } from './scrapers/almatar-client.js';
const dir = 'outputs/almarwa-october-2026';
const previous = JSON.parse(await fs.readFile(`${dir}/prices.json`, 'utf8'));
const records = await Promise.all((await fs.readdir(dir)).filter(name => /^raw-\d+\.json$/.test(name)).map(async name => JSON.parse(await fs.readFile(`${dir}/${name}`, 'utf8'))));
const fetcher = createDailyPricesFetcher({
  resolveImpl: async () => ({ hotelId: previous.hotelId, hotelProfileKey: previous.hotelProfileKey, hotelName: previous.hotelName, countryCode: previous.countryCode }),
  queryImpl: async payload => {
    const matches = records.filter(record => record.response.data.isSearchCompleted && new Date(record.response.data.req.fd * 1000).toISOString().slice(0, 10) === payload.checkIn).sort((a, b) => a.fetchedAt.localeCompare(b.fetchedAt));
    if (!matches.length) throw new Error('No saved completed source response for ' + payload.checkIn);
    return parseAlmatarPackages(matches.map(record => record.response), toAlmatarPayload(payload), Date.parse(previous.fetchedAt));
  },
});
const result = { success: true, ...await fetcher({ ...previous, mealPlan: '' }), fetchedAt: previous.fetchedAt };
await fs.writeFile(`${dir}/prices.json`, JSON.stringify(result, null, 2));
await fs.writeFile('frontend/public/almarwa-october-2026.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ nights: result.rows.length, firstDay: result.rows[0], availableByPlan: Object.fromEntries(['roomOnly', 'breakfast', 'halfBoard'].map(key => [key, result.rows.filter(row => row.offers[key]).length])) }, null, 2));
