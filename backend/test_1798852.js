async function test1798852() {
  const apiToken = '4R!eVj7$&7Q8Duhv1#pB';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Accept': 'application/json',
    'token': apiToken,
    'x-authorization': apiToken,
    'x-api-key': 'apikey-hotel',
    'x-app-name': 'ct-web-hotels-app',
    'x-bt': 'next',
    'x-currency': 'SAR',
    'x-locale': 'ar'
  };

  const res = await fetch('https://www.almosafer.com/api/enigma/hotel-details/1798852', { headers });
  const data = await res.json();
  console.log('atgHotelId for 1798852:', data.atgHotelId);
}

test1798852().catch(console.error);
