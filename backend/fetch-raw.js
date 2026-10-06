import fs from 'fs';
import { createAlmatarClient, almatarHeaders, toAlmatarPayload } from './scrapers/almatar-client.js';

async function main() {
  const req = toAlmatarPayload({
    hotelId: "133550",
    hotelProfileKey: "mecca-al-marwa-rayhaan-by-rotana-makkah-133550",
    countryCode: "SA",
    checkIn: "2026-10-04",
    checkOut: "2026-10-05",
    roomsInfo: [{ adultsCount: 2, kidsAges: [] }]
  });
  
  const res = await fetch(`https://almatar.com/api/hotel/v5/rooms/getpackages/search_with_hotel`, {
    method: 'POST',
    headers: almatarHeaders,
    body: JSON.stringify(req)
  });
  
  const json = await res.json();
  fs.writeFileSync('almatar-raw.json', JSON.stringify(json, null, 2));
  console.log("Saved to almatar-raw.json");
}

main().catch(console.error);
