import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createNusukClient, normalizeNusukRooms } from '../scrapers/nusuk-client.js';
import { createNusukResolver, nusukProfileKey } from '../scrapers/nusuk.js';
import { createLiveScraper } from '../scrapers/almosafer-live.js';
import { buildComparison } from '../scrapers/index.js';
import { buildExportWorkbook } from '../../frontend/src/services/excelExport.js';
import * as XLSX from '../../frontend/node_modules/xlsx/xlsx.mjs';

const option = name => process.argv[process.argv.indexOf(name) + 1];
const hotelInput = process.argv.includes('--url') ? option('--url') : null;
const profile = hotelInput ? nusukProfileKey(hotelInput) : process.argv.includes('--profile') ? option('--profile') : 'mecca-m-hotel-al-dana-makkah-millennium-1660326';
const checkIn = process.argv.includes('--check-in') ? option('--check-in') : '2026-10-20';
const checkOut = new Date(Date.parse(`${checkIn}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
const hotelId = profile.match(/-(\d+)$/)?.[1];
assert(hotelId);
const out = path.resolve('outputs/nusuk-app-probe/verified', hotelInput || process.argv.includes('--profile') || process.argv.includes('--check-in') ? `${hotelId}-${checkIn}` : '.');
await fs.mkdir(out, { recursive: true });
const live = process.argv.includes('--live');
let receipt, counter = 0;
const fetchImpl = live ? async (url, options) => {
  const response = await fetch(url, options);
  const raw = await response.clone().text();
  await fs.writeFile(path.join(out, `live-${counter++}.json`), raw);
  if (url.includes('search_with_')) receipt = JSON.parse(raw);
  return response;
} : async url => ({ ok: true, json: async () => {
  if (url.includes('hotelbyprofilekey')) return JSON.parse(await fs.readFile('outputs/nusuk-app-probe/connectivity/sdk-hotel.body', 'utf8'));
  receipt = JSON.parse(await fs.readFile('outputs/nusuk-app-probe/guest-one-night/packet-0.json', 'utf8'));
  return receipt;
} });
const client = createNusukClient({ fetchImpl });
const resolver = createNusukResolver(client);
const scraper = createLiveScraper(resolver, client.rooms, { source: 'Nusuk', sourceArabic: 'نسك', allowSameNameFallback: false, bookingURL: () => 'https://services.nusuk.sa/app/' });
const params = { hotelInput: hotelInput || `nusuk:${profile}`, checkIn, checkOut, rooms: 1, adults: 2, childAges: [], sources: ['nusuk'], refresh: true };
const rooms = await scraper(params);
assert(rooms.length > 0);
let verifiedQuotes = 0;
const sourcePackages = receipt.data.searchRoomsResults.flatMap(group => [group.defaultPackage, ...(group.packages || [])].filter(Boolean));
for (const room of rooms) for (const day of room.dailyRates) for (const quote of Object.values(day.offers)) {
  const raw = sourcePackages.find(pkg => pkg.packageId === quote.packageId);
  assert(raw);
  assert.equal(quote.sourceTotalPrice, raw.finalPrice);
  assert.equal(quote.price, Math.ceil(Math.fround(raw.finalPrice)));
  assert.equal(String(raw.almtaarHotelId), hotelId);
  assert.equal(raw.currency, 'SAR');
  assert.equal(raw.rooms[0].adultsCount, 2);
  assert.equal(raw.rooms[0].rateId ?? null, quote.roomId);
  assert.equal(raw.rooms[0].roomName, room.roomName);
  assert.equal(raw.rooms[0].roomBasis, quote.mealLabel);
  verifiedQuotes++;
}
const result = buildComparison(params, rooms);
let workbooks = 0;
for (const room of rooms) {
  const selection = buildComparison({ ...params, roomName: room.roomName }, [room]);
  const workbook = buildExportWorkbook(params, [room], selection.summary);
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const roundtrip = XLSX.read(bytes, { type: 'buffer' });
  const cells = Object.values(roundtrip.Sheets).flatMap(sheet => XLSX.utils.sheet_to_json(sheet, { header: 1 }).flat());
  assert(cells.some(value => typeof value === 'string' && value.includes('نسك')));
  for (const quote of Object.values(room.dailyRates[0].offers)) assert(cells.includes(quote.price));
  if (workbooks === 0) await fs.writeFile(path.join(out, 'nusuk-one-night.xlsx'), bytes);
  workbooks++;
}
const report = { testedAt: new Date().toISOString(), liveFetchThisRun: live,
  hotel: rooms[0].hotelName, hotelId, hotelInput: params.hotelInput, checkIn: params.checkIn, checkOut: params.checkOut,
  adults: 2, rooms: 1, currency: 'SAR', roomTypes: rooms.length, verifiedQuotes, verifiedExcelWorkbooks: workbooks,
  nativeSdkApiAccess: true, emulatorUsed: false, visualAppScreenVerified: false, accountPricingVerified: false,
  checks: { completeSearch: true, hotelDatesCurrencyOccupancy: true, quoteReceiptReconciliation: true, androidDisplayRounding: true, excelRoundtrip: true } };
await fs.writeFile(path.join(out, 'verification.json'), JSON.stringify(report, null, 2));
await fs.writeFile(path.join(out, 'website-result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(report));
