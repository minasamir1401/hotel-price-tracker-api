async function dumpHotelDetails() {
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

  const res = await fetch('https://www.almosafer.com/api/enigma/hotel-details/1287944', { headers });
  const data = await res.json();
  
  function scan(obj, path = '') {
    if (!obj || typeof obj !== 'object') return;
    for (const k of Object.keys(obj)) {
      const p = path ? `${path}.${k}` : k;
      if (k.toLowerCase().includes('id') || k.toLowerCase().includes('code')) {
        console.log(`${p} = ${JSON.stringify(obj[k])}`);
      }
      if (typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
        scan(obj[k], p);
      }
    }
  }

  scan(data);
}

dumpHotelDetails().catch(console.error);
