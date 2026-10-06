async function testUserDateRange() {
  const hotelId = 1798852;
  const checkIn = '2026-09-29';
  const checkOut = '2026-10-11';
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
    'Referer': 'https://www.almosafer.com/ar/hotel/details/atg/%D9%85%D9%8A%D9%84%D9%8A%D9%86%D9%8A%D9%88%D9%85-%D9%85%D9%83%D8%A9-%D8%A7%D9%84%D9%86%D8%B3%D9%8A%D9%85-1798852?checkin=29-09-2026&checkout=11-10-2026&rooms=2_adult',
    'token': apiToken,
    'x-authorization': apiToken,
    'x-api-key': 'apikey-hotel',
    'x-app-name': 'ct-web-hotels-app',
    'x-bt': 'next',
    'x-currency': 'SAR',
    'x-locale': 'ar'
  };

  console.log('Sending search for 2026-09-29 to 2026-10-11...');
  const initRes = await fetch('https://www.almosafer.com/api/enigma/v7/packages', {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload)
  });
  const init = await initRes.json();
  console.log('Init:', init);

  await new Promise(r => setTimeout(r, 3000));
  const pollRes = await fetch(`https://www.almosafer.com/api/enigma/v7/packages/poll/${init.pId}`, { headers });
  const poll = await pollRes.json();

  const standardGroup = (poll.packagesGroups || []).find(g => 
    (g.title?.ar || '').includes('ستاندرد') || (g.title?.en || '').toLowerCase().includes('standard')
  );

  if (!standardGroup) {
    console.log('Standard group not found. Available groups:', (poll.packagesGroups || []).map(g => g.title?.ar));
    return;
  }

  console.log('Found standard group:', standardGroup.title.ar);
  
  // Find twin room packages:
  const twinPackages = standardGroup.packages.filter(p => {
    const bed = p.rooms[0]?.rmsDetail?.locale?.ar?.bedding || '';
    return bed.includes('٢ سرير فردي') || bed.includes('2 Twin');
  });

  console.log(`Found ${twinPackages.length} twin packages`);
  for (const p of twinPackages) {
    const basis = p.rooms[0]?.roomBasis;
    const nightly = p.packageRateInfo?.packageNightlyRates || [];
    console.log(`\n--- Basis: ${basis} | Total: ${p.packageRateInfo.total} SAR | Nights count: ${nightly.length} ---`);
    nightly.forEach((n, idx) => {
      // Calculate date:
      const d = new Date(Date.UTC(2026, 8, 29 + idx));
      const dStr = d.toISOString().split('T')[0];
      console.log(`  Night ${idx + 1} (${dStr}): ${n.rate} SAR (rounded: ${Math.round(n.rate)})`);
    });
  }
}

testUserDateRange();
