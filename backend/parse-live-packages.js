import fs from 'fs';

async function parsePackages() {
  const hotelId = 1798852;
  const checkIn = '2026-10-08';
  const checkOut = '2026-10-09';
  const roomsInfo = [{ adultsCount: 2, kidsAges: [] }];

  const payload = {
    checkIn,
    checkOut,
    roomsInfo,
    hotelId: String(hotelId),
    currency: 'SAR'
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

  const initRes = await fetch('https://www.almosafer.com/api/enigma/v7/packages', {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload)
  });
  const init = await initRes.json();
  console.log('Init:', init);

  await new Promise(r => setTimeout(r, 2000));
  const pollRes = await fetch(`https://www.almosafer.com/api/enigma/v7/packages/poll/${init.pId}`, { headers });
  const poll = await pollRes.json();

  fs.writeFileSync('backend/live_packages.json', JSON.stringify(poll, null, 2));
  console.log('Saved to backend/live_packages.json');

  console.log('Currency:', poll.currencyCode);
  for (const group of poll.packagesGroups || []) {
    console.log(`\n=== Group: ${group.title?.ar || group.title?.en} ===`);
    for (const tId in group.templates || {}) {
      const tmpl = group.templates[tId];
      console.log(`  Template: ${tmpl.templateTitle || tmpl.templateNameForCode}`);
    }
    for (const pkg of group.packages || []) {
      const basis = pkg.meal || pkg.basis || pkg.roomBasis;
      const price = pkg.price?.total || pkg.rate?.total || pkg.price;
      const cancellation = pkg.cancellation?.summary || pkg.cancellationPolicy?.summary;
      console.log(`  Package: ${pkg.packageTitle || pkg.title} | Basis: ${basis} | Price:`, price, '| Cancel:', cancellation);
    }
  }
}

parsePackages();
