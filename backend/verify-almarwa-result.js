import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const result = JSON.parse(await fs.readFile('outputs/almarwa-october-2026/prices.json', 'utf8'));
const files = (await fs.readdir('outputs/almarwa-october-2026')).filter(name => /^raw-\d+\.json$/.test(name));
const records = await Promise.all(files.map(async name => JSON.parse(await fs.readFile(`outputs/almarwa-october-2026/${name}`, 'utf8'))));
assert.equal(result.rows.length, 31);
for (const row of result.rows) {
  assert.equal(row.nextDate, new Date(Date.parse(`${row.date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10));
  for (const [field, label] of [['roomOnly', 'إقامة فقط'], ['breakfast', 'إقامة وإفطار'], ['halfBoard', 'إفطار + غداء أو عشاء']]) {
  const offer = row.offers[field];
  if (!offer) continue;
  const matching = records.find(record => record.response.data.isSearchCompleted === true && new Date(record.response.data.req.fd * 1000).toISOString().slice(0, 10) === row.date && record.response.data.searchRoomsResults.some(group => [group.defaultPackage, ...(group.packages || [])].filter(Boolean).some(pkg => pkg.packageId === offer.packageId)));
  assert.ok(matching, row.date + ' has source evidence');
  const pkg = matching.response.data.searchRoomsResults.flatMap(group => [group.defaultPackage, ...(group.packages || [])].filter(Boolean)).find(pkg => pkg.packageId === offer.packageId);
  assert.equal(pkg.rooms[0].roomName, result.roomName);
  assert.equal(pkg.rooms[0].bedType.toUpperCase(), 'TWIN BED');
  assert.equal(pkg.rooms[0].roomBasis, label);
  assert.equal(pkg.rooms[0].adultsCount, 2);
  assert.equal(pkg.rooms.length, 1);
  assert.equal(String(pkg.almtaarHotelId), '133550');
  assert.equal(Math.ceil(Number(pkg.finalPrice)), Number(row[field]));
  assert.equal(pkg.currency, 'SAR');
  }
}
console.log('Verified all 31 dates and source package evidence for all available meal plans.');
const health = await fetch('http://127.0.0.1:5000/health').then(res => res.json());
console.log('Backend health:', health.status);
const status = await fetch('http://localhost:5173/api/system-status').then(res => res.json());
console.log('Frontend proxy:', status.almatar);
const live = await fetch('http://localhost:5173/api/daily-prices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hotelInput: result.hotelInput, checkIn: '2026-10-01', checkOut: '2026-10-02', adults: 2, rooms: 1, roomName: result.roomName, bedCount: 2, bedType: 'single', mealPlan: '' }) }).then(res => res.json());
assert.equal(live.success, true);
assert.equal(live.rows.length, 1);
assert.ok(live.rows[0].offers.breakfast.packageId);
assert.ok(live.rows[0].offers.halfBoard.packageId);
console.log('Live frontend API:', live.rows[0].roomOnly, live.rows[0].breakfast, live.rows[0].halfBoard);
