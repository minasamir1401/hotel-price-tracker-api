async function testHotelInfoKeys() {
  const apiToken = '4R!eVj7$&7Q8Duhv1#pB';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'token': apiToken,
    'x-authorization': apiToken,
    'x-api-key': 'apikey-hotel',
    'x-app-name': 'ct-web-hotels-app',
    'x-bt': 'next',
    'x-currency': 'SAR',
    'x-locale': 'ar'
  };

  const res = await fetch('https://www.almosafer.com/api/enigma/hotel-details/1287944', { headers });
  const data = await res.json();
  console.log('Top level keys:', Object.keys(data));
  console.log('id:', data.id, 'hotelId:', data.hotelId, 'supplier:', data.supplier, 'atgId:', data.atgId);
}

testHotelInfoKeys().catch(console.error);
