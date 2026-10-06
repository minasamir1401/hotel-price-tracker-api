async function testSearchWithVariant() {
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
    hotelsId: [1287944],
    currency: 'SAR',
    variant: 'MULTI_SEARCH_SPLIT'
  };

  const res = await fetch('https://www.almosafer.com/api/enigma/search/async', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  console.log('Search async response:', data);

  if (data.sId) {
    for (let attempt = 1; attempt <= 4; attempt++) {
      await new Promise(r => setTimeout(r, 2000));
      const pollRes = await fetch(`https://www.almosafer.com/api/enigma/search/poll/${data.sId}`, { headers });
      const pollData = await pollRes.json();
      console.log(`Poll ${attempt}: status=${pollData.searchStatus}, totalResults=${pollData.totalResults}, results=${pollData.searchResults?.length}`);
      if (pollData.searchResults?.length > 0) {
        for (const item of pollData.searchResults) {
          if (item.hotelId === 1287944 || pollData.searchResults.length <= 5) {
            console.log('Found hotel:', {
              hotelId: item.hotelId,
              basePrice: item.basePrice,
              firstPrice: item.firstPrice,
              roomBasis: item.roomBasis,
              boards: item.boards,
              rooms: item.rooms
            });
          }
        }
      }
      if (pollData.searchStatus === 'COMPLETED_SUCCESSFULLY') break;
    }
  }
}

testSearchWithVariant().catch(console.error);
