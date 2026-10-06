import fs from 'fs';

// Helper to poll Almosafer Enigma API
async function fetchEnigmaPackages(checkIn, checkOut, adults = 2, hotelId = '1798852') {
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
    checkIn,
    checkOut,
    roomsInfo: [{ adultsCount: Number(adults) || 2, kidsAges: [] }],
    hotelId: String(hotelId),
    currency: 'SAR'
  };

  try {
    const initRes = await fetch('https://www.almosafer.com/api/enigma/v7/packages', {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload)
    });
    const init = await initRes.json();
    if (!init.pId) return null;

    const delay = init.initialDelayInMillis || 2000;
    await new Promise(r => setTimeout(r, delay));

    for (let attempt = 1; attempt <= 4; attempt++) {
      const pollRes = await fetch(`https://www.almosafer.com/api/enigma/v7/packages/poll/${init.pId}`, { headers });
      const poll = await pollRes.json();

      if (poll.packagesGroups && poll.packagesGroups.length > 0) {
        return poll;
      }
      if (poll.pollingStatus === 'COMPLETED_SUCCESSFULLY') {
        return poll;
      }
      await new Promise(r => setTimeout(r, 1200));
    }
  } catch (err) {
    console.error('fetchEnigmaPackages error:', err.message);
  }
  return null;
}

async function testScraperFull() {
  console.log('Testing full scrape for 2026-10-08 to 2026-10-09...');
  const poll = await fetchEnigmaPackages('2026-10-08', '2026-10-09', 2, '1798852');
  if (!poll) {
    console.log('Failed to fetch packages');
    return;
  }

  for (const group of poll.packagesGroups || []) {
    console.log(`\nGroup: ${group.title?.ar}`);
    const pkgs = group.packages || [];
    for (const p of pkgs) {
      const room = p.rooms?.[0];
      const bed = room?.rmsDetail?.locale?.ar?.bedding || '';
      const basis = room?.roomBasis;
      const rate = p.packageRateInfo?.total;
      console.log(`  ${room?.roomName?.ar || group.title?.ar} [${bed}] -> ${basis}: ${rate} SAR`);
    }
  }
}

testScraperFull();
