async function testSearchResults() {
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
    query: 'كينجزجيت ديار',
    currency: 'SAR'
  };

  const res = await fetch('https://www.almosafer.com/api/enigma/search/async', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  const { sId } = await res.json();
  console.log('Got sId for query:', sId);

  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const pollRes = await fetch(`https://www.almosafer.com/api/enigma/search/poll/${sId}`, { headers });
    const pollData = await pollRes.json();
    console.log(`Poll ${i+1}: status=${pollData.searchStatus}, totalResults=${pollData.totalResults}, resultsLen=${pollData.searchResults?.length}`);
    if (pollData.searchResults?.length > 0) {
      for (const item of pollData.searchResults) {
        console.log(`Found hotel: hotelId=${item.hotelId}, basePrice=${item.basePrice}, roomBasis=${item.roomBasis}`);
      }
    }
    if (pollData.searchStatus === 'COMPLETED_SUCCESSFULLY') break;
  }
}

testSearchResults().catch(console.error);
