import { createAlmatarClient } from './scrapers/almatar-client.js';

async function main() {
  const query = createAlmatarClient();
  const res = await query({
    hotelId: "133550",
    hotelProfileKey: "mecca-al-marwa-rayhaan-by-rotana-makkah-133550", // Or maybe just ignore
    countryCode: "SA",
    checkIn: "2026-10-04",
    checkOut: "2026-10-05",
    roomsInfo: [{ adultsCount: 2, kidsAges: [] }]
  });
  
  console.log(JSON.stringify(res, null, 2));
}

main().catch(console.error);
