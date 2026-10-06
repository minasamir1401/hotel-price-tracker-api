async function pollAlmosafer() {
  const hotelId = 1798852;
  const checkIn = '2026-10-08';
  const checkOut = '2026-10-09';
  const roomsInfo = [{ adultsCount: 2, kidsAges: [] }];

  const payload = {
    checkIn,
    checkOut,
    roomsInfo,
    hotelId: String(hotelId)
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

  console.log('Initiating search on Almosafer...');
  const initRes = await fetch('https://www.almosafer.com/api/enigma/v7/packages', {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload)
  });
  const initData = await initRes.json();
  console.log('Init response:', initData);

  const pId = initData.pId;
  const delay = initData.initialDelayInMillis || 2500;
  console.log(`Waiting ${delay}ms before polling...`);
  await new Promise(r => setTimeout(r, delay));

  // Poll
  for (let attempt = 1; attempt <= 6; attempt++) {
    console.log(`Polling attempt ${attempt} for pId: ${pId}...`);
    const pollUrl = `https://www.almosafer.com/api/enigma/v7/packages/poll/${pId}`;
    const pollRes = await fetch(pollUrl, { headers });
    console.log(`Poll status: ${pollRes.status}`);
    const pollData = await pollRes.json();
    console.log('PollingStatus:', pollData.pollingStatus, 'Package count:', pollData.packages?.length || 0);

    if (pollData.packages && pollData.packages.length > 0) {
      console.log('Success! Found packages:');
      for (const pkg of pollData.packages.slice(0, 10)) {
        const roomName = pkg.rooms?.[0]?.roomName || pkg.roomName || 'Unknown Room';
        const meal = pkg.rooms?.[0]?.meal || pkg.mealPlan || pkg.basis || 'Unknown Meal';
        const price = pkg.price?.total || pkg.rate?.total || pkg.totalPrice || pkg.price;
        const cancel = pkg.cancellationPolicy?.description || pkg.cancellationSummary;
        console.log(`- Room: ${roomName} | Meal: ${meal} | Price: ${JSON.stringify(price)} | Cancel: ${JSON.stringify(cancel)}`);
      }
      // Save full result
      import('fs').then(fs => fs.writeFileSync('backend/sample_poll_result.json', JSON.stringify(pollData, null, 2)));
      break;
    }

    if (pollData.pollingStatus === 'COMPLETED' || pollData.pollingStatus === 'FINISHED') {
      console.log('Completed with no packages?');
      break;
    }

    await new Promise(r => setTimeout(r, 2000));
  }
}

pollAlmosafer();
