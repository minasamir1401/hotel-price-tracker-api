async function checkSingleNights() {
  const dates = [
    { in: '2026-09-29', out: '2026-09-30' },
    { in: '2026-10-05', out: '2026-10-06' },
    { in: '2026-10-08', out: '2026-10-09' },
  ];

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

  for (const d of dates) {
    const payload = {
      checkIn: d.in,
      checkOut: d.out,
      roomsInfo: [{ adultsCount: 2, kidsAges: [] }],
      hotelId: '1798852',
      currency: 'SAR'
    };

    const initRes = await fetch('https://www.almosafer.com/api/enigma/v7/packages', {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload)
    });
    const init = await initRes.json();
    await new Promise(r => setTimeout(r, 2200));

    const pollRes = await fetch(`https://www.almosafer.com/api/enigma/v7/packages/poll/${init.pId}`, { headers });
    const poll = await pollRes.json();

    const standardGroup = (poll.packagesGroups || []).find(g => 
      (g.title?.ar || '').includes('ستاندرد') || (g.title?.en || '').toLowerCase().includes('standard')
    );

    const twinPackages = standardGroup?.packages.filter(p => {
      const bed = p.rooms[0]?.rmsDetail?.locale?.ar?.bedding || '';
      return bed.includes('٢ سرير فردي') || bed.includes('2 Twin');
    }) || [];

    console.log(`\n=== Date: ${d.in} ===`);
    twinPackages.forEach(p => {
      console.log(`  Basis: ${p.rooms[0]?.roomBasis} | Price: ${p.packageRateInfo.total} SAR (Rounded: ${Math.round(p.packageRateInfo.total)})`);
    });
  }
}

checkSingleNights();
