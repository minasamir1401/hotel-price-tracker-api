async function testIntHotelId() {
  const apiToken = '4R!eVj7$&7Q8Duhv1#pB';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'Origin': 'https://www.almosafer.com',
    'token': apiToken,
    'x-authorization': apiToken,
    'x-api-key': 'apikey-hotel',
    'x-app-name': 'ct-web-hotels-app',
    'x-bt': 'next',
    'x-currency': 'SAR',
    'x-locale': 'ar'
  };

  const payload = {
    checkIn: '2026-10-01',
    checkOut: '2026-10-02',
    roomsInfo: [{ adultsCount: 2, kidsAges: [] }],
    hotelId: 1287944, // INT!
    currency: 'SAR',
    isMultiResponse: false
  };

  console.log('Testing PUT with int hotelId...');
  const res = await fetch('https://www.almosafer.com/api/enigma/v7/packages', {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload)
  });
  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Result:', data);
}

testIntHotelId().catch(console.error);
