async function testMethods() {
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
    'x-locale': 'ar',
  };

  const payload = {
    checkIn: '2026-10-01',
    checkOut: '2026-10-02',
    roomsInfo: [{ adultsCount: 2, kidsAges: [] }],
    hotelId: '1287944',
    currency: 'SAR',
    variant: 'control',
  };

  console.log('Testing POST...');
  const postRes = await fetch('https://www.almosafer.com/api/enigma/v7/packages', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  console.log('POST status:', postRes.status);
  const postData = await postRes.json();
  console.log('POST data:', postData);

  if (postData.pId && !postData.pId.startsWith('no-pkg')) {
    console.log('Polling pId from POST:', postData.pId);
    await new Promise(r => setTimeout(r, 2000));
    const pollRes = await fetch(`https://www.almosafer.com/api/enigma/v7/packages/poll/${postData.pId}`, { headers });
    const poll = await pollRes.json();
    console.log('Poll groups:', poll.packagesGroups?.length);
  }
}

testMethods().catch(console.error);
