import { fetchOneNight } from './daily-prices-almatar.js';
async function run() {
  const data = await fetchOneNight({
    hotelId: '133550',
    hotelProfileKey: 'mecca-al-marwa-rayhaan-by-rotana-makkah-133550',
    countryCode: 'SA',
    checkIn: '2026-10-01',
    checkOut: '2026-10-02',
    adults: 2,
    childAges: []
  });
  console.log(JSON.stringify(data.rooms.filter(r => r.roomName.includes('توأم')), null, 2));
}
run();
