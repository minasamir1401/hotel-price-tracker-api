async function testSearchAsync() {
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
    currency: 'SAR'
  };

  const res = await fetch('https://www.almosafer.com/api/enigma/search/async', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  console.log('Search async status:', res.status);
  const data = await res.json();
  console.log('Search async response:', data);

  if (data.sId) {
    console.log('Got sId:', data.sId);
    // Poll search results
    await new Promise(r => setTimeout(r, 2000));
    const pollRes = await fetch(`https://www.almosafer.com/api/enigma/search/poll/${data.sId}`, { headers });
    const pollData = await pollRes.json();
    console.log('Poll search data:', JSON.stringify(pollData).substring(0, 1000));

    // Now test enigma packages with this sId!
    const pkgPayload = {
      checkIn: '2026-10-01',
      checkOut: '2026-10-02',
      roomsInfo: [{ adultsCount: 2, kidsAges: [] }],
      hotelId: '1287944',
      currency: 'SAR',
      sId: data.sId
    };

    console.log('Testing PUT packages with sId...');
    const pkgRes = await fetch('https://www.almosafer.com/api/enigma/v7/packages', {
      method: 'PUT',
      headers,
      body: JSON.stringify(pkgPayload)
    });
    const pkgData = await pkgRes.json();
    console.log('PUT packages with sId response:', pkgData);

    if (pkgData.pId && !pkgData.pId.startsWith('no-pkg')) {
      console.log('Got valid pId:', pkgData.pId);
      await new Promise(r => setTimeout(r, 3000));
      const pPollRes = await fetch(`https://www.almosafer.com/api/enigma/v7/packages/poll/${pkgData.pId}`, { headers });
      const pPoll = await pPollRes.json();
      console.log('Packages groups:', pPoll.packagesGroups?.length);
      if (pPoll.packagesGroups?.length > 0) {
        console.log('First group title:', pPoll.packagesGroups[0].title);
        console.log('First pkg rates:', pPoll.packagesGroups[0].packages?.map(p => ({
          basis: p.rooms?.[0]?.roomBasis,
          rate: p.packageRateInfo?.total
        })));
      }
    }
  }
}

testSearchAsync().catch(console.error);
