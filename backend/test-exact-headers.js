async function run() {
  const referer = 'https://www.almosafer.com/ar/hotel/details/atg/%D9%81%D9%86%D8%AF%D9%82-%D9%83%D9%8A%D9%86%D8%AC%D8%B2%D8%AC%D9%8A%D8%AA-%D8%AF%D9%8A%D8%A7%D8%B1-1287944?checkin=20-10-2026&checkout=21-10-2026&rooms=3_adult&ncr=1';
  
  const headers = {
    'sec-ch-ua-platform': '"Windows"',
    'x-bt': 'next',
    'x-api-key': 'apikey-hotel',
    'x-currency': 'SAR',
    'x-locale': 'ar',
    'token': 'skdjfh73273$7268u2j89s',
    'x-platform': 'web',
    'x-app-name': 'ct-web-hotels-app',
    'Referer': referer,
    'Origin': 'https://www.almosafer.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript',
    'Content-Type': 'application/json'
  };

  const payload = {
    checkIn: '2026-10-20',
    checkOut: '2026-10-21',
    roomsInfo: [{ adultsCount: 3, kidsAges: [] }],
    hotelId: 1287944,
    variant: 'control'
  };

  console.log('Sending PUT /packages...');
  const initRes = await fetch('https://www.almosafer.com/api/enigma/v7/packages', {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload)
  });

  const init = await initRes.json();
  console.log('init:', init);

  if (!init.pId) return;

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const pollRes = await fetch(`https://www.almosafer.com/api/enigma/v7/packages/poll/${encodeURIComponent(init.pId)}`, {
      headers
    });
    const poll = await pollRes.json();
    console.log('Poll attempt', i + 1, 'status:', poll.pollingStatus);
    if (poll.pollingStatus === 'COMPLETED_SUCCESSFULLY') {
      for (const g of poll.packagesGroups || []) {
        console.log('Group:', g.title?.ar || g.title?.en);
        for (const p of g.packages || []) {
          console.log(`  Basis: ${p.rooms?.[0]?.roomBasis} | Total: ${p.packageRateInfo?.total}`);
        }
      }
      break;
    }
  }
}

run();
