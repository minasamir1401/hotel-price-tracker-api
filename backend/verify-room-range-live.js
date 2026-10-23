// Live verification for the user's Al Rayadah Grand example. This contacts the
// configured source transport; use an optional checkout argument for a shorter run.
import './runtime-env.js';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHotelRoomsService } from './hotel-rooms-service.js';
import { resolveAlmosaferDetails, almosaferClient, scrapeAlmosafer } from './scrapers/almosafer.js';
import { almosaferFetch } from './scrapers/almosafer-http.js';

const input = { hotelInput: 'https://www.almosafer.com/ar/hotel/details/atg/الريادة-جراند-3999319', source: 'almosafer',
  checkIn: '2027-02-01', checkOut: process.argv[2] || '2027-03-04', adults: 2, rooms: 1, children: 0, childAges: [], refresh: true };
const started = Date.now();
let lastCompleted = -1;
let lastPhase;
const report = { input, startedAt: new Date().toISOString() };
try {
  const service = createHotelRoomsService({ resolveAlmosafer: resolveAlmosaferDetails, enigmaClient: almosaferClient });
  const catalog = await service({ ...input, onProgress: p => {
    const completed = p.phase === 'repairing' ? p.repairCompleted : p.completed;
    if (completed !== lastCompleted || p.phase !== lastPhase) {
      lastCompleted = completed; lastPhase = p.phase;
      console.log(`${p.phase || 'collecting'}: ${completed}/${p.phase === 'repairing' ? p.repairTotal : p.total}, unverified: ${p.unverifiedNights || 0} (${Math.round((Date.now() - started) / 1000)}s)`);
    }
  } });
  report.catalogMs = Date.now() - started;
  report.catalog = catalog;
  if (catalog.roomInventoryId) {
    const reusedAt = Date.now();
    const results = await scrapeAlmosafer({ ...input, roomInventoryId: catalog.roomInventoryId });
    report.searchReuseMs = Date.now() - reusedAt;
    report.results = results;
    for (const entry of catalog.roomAvailability) {
      const dates = [...new Set(results.filter(r => r.roomName === entry.name).flatMap(r => r.dailyRates.filter(d => d.availability === 'available').map(d => d.date)))].sort();
      assert.deepEqual(dates, entry.availableDates);
    }
  }
  report.status = catalog.warnings.length ? 'partial' : 'verified';
  console.log(JSON.stringify({ status: report.status, hotelId: catalog.hotelId, rooms: catalog.rooms.length,
    catalogMs: report.catalogMs, searchReuseMs: report.searchReuseMs, warnings: catalog.warnings.length }));
} catch (error) {
  report.status = 'failed';
  report.error = { message: error.message, code: error.code, diagnosticId: error.diagnosticId, stage: error.stage };
  console.log(JSON.stringify(report.error));
  process.exitCode = 1;
} finally {
  report.elapsedMs = Date.now() - started;
  const directory = new URL('../outputs/room-range-verification/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL(`${input.checkOut}.json`, directory), JSON.stringify(report, null, 2));
  await almosaferFetch.close();
}
