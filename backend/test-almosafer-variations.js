async function run() {
  const token = '4R!eVj7$&7Q8Duhv1#pB';
  const baseHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Origin': 'https://www.almosafer.com',
    'token': token,
    'x-authorization': token,
    'x-api-key': 'apikey-hotel',
    'x-currency': 'SAR',
    'x-locale': 'ar',
    'general-key': 'general-key',
  };

  const variations = [
    { name: 'Standard current', headers: { ...baseHeaders, 'x-app-name': 'ct-web-hotels-app', 'x-bt': 'next', 'x-platform': 'web' } },
    { name: 'With x-pos SA', headers: { ...baseHeaders, 'x-app-name': 'ct-web-hotels-app', 'x-bt': 'next', 'x-platform': 'web', 'x-pos': 'SA', 'x-country-code': 'SA' } },
    { name: 'Mobile web (mweb)', headers: { ...baseHeaders, 'x-app-name': 'ct-web-hotels-app', 'x-bt': 'next', 'x-platform': 'mweb', 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } },
    { name: 'Desktop app-name', headers: { ...baseHeaders, 'x-app-name': 'ct-desktop-hotels-app', 'x-bt': 'next', 'x-platform': 'desktop' } },
  ];

  for (const v of variations) {
    console.log('Testing variation:', v.name);
    try {
      const payload = {
        hotelId: '1287944',
        checkIn: '2026-10-20',
        checkOut: '2026-10-21',
        roomsInfo: [{ adultsCount: 3, kidsAges: [] }],
        currency: 'SAR'
      };
      const initRes = await fetch('https://www.almosafer.com/api/enigma/v7/packages', {
        method: 'PUT',
        headers: v.headers,
        body: JSON.stringify(payload)
      });
      const init = await initRes.json();
      if (!init.pId || init.pId.startsWith('no-pkg')) {
        console.log('  no pId');
        continue;
      }
      await new Promise(r => setTimeout(r, init.initialDelayInMillis || 3000));
      const pollRes = await fetch('https://www.almosafer.com/api/enigma/v7/packages/poll/' + encodeURIComponent(init.pId), { headers: v.headers });
      const poll = await pollRes.json();
      const tripleGroup = poll.packagesGroups?.find(g => g.title?.ar?.includes('ثلاثية'));
      for (const p of tripleGroup?.packages || []) {
        console.log(`  [${v.name}] Basis: ${p.rooms?.[0]?.roomBasis} | Total: ${p.packageRateInfo?.total} | FirstTotal: ${p.packageRateInfo?.firstTotal}`);
      }
    } catch (e) {
      console.log('  error:', e.message);
    }
  }
}
run();
