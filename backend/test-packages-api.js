async function testAlmosaferApi() {
  const hotelId = 1798852;
  const checkIn = '2026-10-08';
  const checkOut = '2026-10-09';
  const roomsInfo = [{ adultsCount: 2, kidsAges: [] }];

  const payload = {
    checkIn,
    checkOut,
    roomsInfo,
    hotelId: String(hotelId)
  };

  const apiToken = '4R!eVj7$&7Q8Duhv1#pB';

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'Origin': 'https://www.almosafer.com',
    'Referer': 'https://www.almosafer.com/ar/hotel/details/atg/%D9%85%D9%8A%D9%84%D9%8A%D9%86%D9%8A%D9%88%D9%85-%D9%85%D9%83%D8%A9-%D8%A7%D9%84%D9%86%D8%B3%D9%8A%D9%85-1798852?checkin=08-10-2026&checkout=09-10-2026&rooms=2_adult',
    'token': apiToken,
    'x-authorization': apiToken,
    'x-api-key': 'apikey-hotel',
    'x-app-name': 'ct-web-hotels-app',
    'x-bt': 'next',
    'x-currency': 'SAR',
    'x-locale': 'ar'
  };

  const endpoints = [
    { method: 'PUT', url: 'https://www.almosafer.com/api/enigma/v2/packages' },
    { method: 'POST', url: 'https://www.almosafer.com/api/enigma/v7/packages' },
    { method: 'POST', url: 'https://www.almosafer.com/api/enigma/packages' },
    { method: 'PUT', url: 'https://www.almosafer.com/api/enigma/v7/packages' }
  ];

  for (const ep of endpoints) {
    try {
      console.log(`Trying ${ep.method} ${ep.url}...`);
      const res = await fetch(ep.url, {
        method: ep.method,
        headers,
        body: JSON.stringify(payload)
      });
      console.log(`Status: ${res.status}`);
      const text = await res.text();
      console.log(`Response: ${text.slice(0, 300)}`);
    } catch (err) {
      console.log(`Error on ${ep.url}:`, err.message);
    }
  }
}

testAlmosaferApi();
