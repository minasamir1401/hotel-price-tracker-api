import { fetchDailyPricesAlmatar } from './daily-prices-almatar.js';

async function test() {
  const HOTEL_URL = 'https://almatar.com/ar/hotels/rooms/mecca-al-marwa-rayhaan-by-rotana-makkah-133550/?checkIn=10%2F06%2F2026&checkOut=10%2F07%2F2026&rooms=2_adult&source=list&freq=&fname=&h_index=0';
  const data = await fetchDailyPricesAlmatar({
    hotelInput: HOTEL_URL,
    checkIn: '2026-10-06',
    checkOut: '2026-10-07',
    adults: 2,
    rooms: 1,
    roomName: 'غرفة واسعة بسرير توأم',
    roomKeywords: ['غرفة واسعة بسرير توأم'],
  });

  console.log('Result row for 2026-10-06:');
  const row = data.rows[0];
  console.log('Date:', row.date);
  console.log('Day:', row.dayName);
  console.log('Breakfast NonRef:', row.breakfast);
  console.log('Breakfast Flexible:', row.breakfastFlexible);
  console.log('HalfBoard:', row.halfBoard);
  console.log('RoomOnly:', row.roomOnly);
  console.log('Status:', row.dayStatus);
  console.log('All offers:', Object.keys(row.offers).map(k => `${k}: ${row.offers[k].price} (${row.offers[k].cancellationPolicy})`));
}

test().catch(console.error);
