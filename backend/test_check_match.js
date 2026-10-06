async function checkHotelInResults() {
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

  const pollRes = await fetch(`https://www.almosafer.com/api/enigma/search/poll/01a0f23c-e079-7a51-872e-a24ccfbf4863`, { headers });
  const pollData = await pollRes.json();
  const match = (pollData.searchResults || []).find(h => String(h.hotelId) === '1287944');
  console.log('Match 1287944:', match);
  if (!match) {
    console.log('HotelIds in results:', (pollData.searchResults || []).map(h => h.hotelId).slice(0, 30));
  }
}

checkHotelInResults().catch(console.error);
