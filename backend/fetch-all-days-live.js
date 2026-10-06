async function fetchAllDaysLive(checkInStr, checkOutStr, adults = 2) {
  const [inY, inM, inD] = checkInStr.split('-').map(Number);
  const [outY, outM, outD] = checkOutStr.split('-').map(Number);
  const t1 = Date.UTC(inY, inM - 1, inD, 12, 0, 0);
  const t2 = Date.UTC(outY, outM - 1, outD, 12, 0, 0);
  const nights = Math.max(1, Math.round((t2 - t1) / (1000 * 60 * 60 * 24)));

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

  async function fetchDayPrice(curInStr, curOutStr) {
    try {
      const payload = {
        checkIn: curInStr,
        checkOut: curOutStr,
        roomsInfo: [{ adultsCount: adults, kidsAges: [] }],
        hotelId: '1798852',
        currency: 'SAR'
      };

      const initRes = await fetch('https://www.almosafer.com/api/enigma/v7/packages', {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload)
      });
      const init = await initRes.json();
      if (!init.pId) return null;

      const delay = init.initialDelayInMillis || 2000;
      await new Promise(r => setTimeout(r, delay));

      for (let attempt = 1; attempt <= 3; attempt++) {
        const pollRes = await fetch(`https://www.almosafer.com/api/enigma/v7/packages/poll/${init.pId}`, { headers });
        const poll = await pollRes.json();
        
        const standardGroup = (poll.packagesGroups || []).find(g => 
          (g.title?.ar || '').includes('ستاندرد') || (g.title?.en || '').toLowerCase().includes('standard')
        );

        const twinPackages = standardGroup?.packages.filter(p => {
          const bed = p.rooms[0]?.rmsDetail?.locale?.ar?.bedding || '';
          return bed.includes('٢ سرير فردي') || bed.includes('2 Twin');
        }) || [];

        if (twinPackages.length > 0) {
          const ro = twinPackages.find(p => p.rooms[0]?.roomBasis === 'RO')?.packageRateInfo?.total;
          const bb = twinPackages.find(p => p.rooms[0]?.roomBasis === 'BB')?.packageRateInfo?.total;
          const hb = twinPackages.find(p => p.rooms[0]?.roomBasis === 'HB')?.packageRateInfo?.total;
          const cancel = twinPackages[0]?.cancellationPolicy?.hasFreeCancellation
            ? 'إلغاء مجاني'
            : 'غير مسترد';

          return {
            date: curInStr,
            ro: ro ? Math.round(ro) : null,
            bb: bb ? Math.round(bb) : null,
            hb: hb ? Math.round(hb) : null,
            cancel
          };
        }

        if (poll.pollingStatus === 'COMPLETED_SUCCESSFULLY') break;
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (e) {
      console.error(`Error fetching day ${curInStr}:`, e.message);
    }
    return null;
  }

  console.log(`Fetching all ${nights} nights for date range ${checkInStr} to ${checkOutStr}...`);
  const days = [];
  for (let i = 0; i < nights; i++) {
    const d1 = new Date(Date.UTC(inY, inM - 1, inD + i, 12, 0, 0));
    const d2 = new Date(Date.UTC(inY, inM - 1, inD + i + 1, 12, 0, 0));
    const s1 = d1.toISOString().split('T')[0];
    const s2 = d2.toISOString().split('T')[0];
    days.push({ s1, s2 });
  }

  // Run in chunks of 3 parallel requests
  const results = [];
  for (let i = 0; i < days.length; i += 3) {
    const chunk = days.slice(i, i + 3);
    const chunkResults = await Promise.all(chunk.map(d => fetchDayPrice(d.s1, d.s2)));
    results.push(...chunkResults);
  }

  console.log('\n=== REAL DYNAMIC PRICES FROM ALMOSAFER ===');
  console.table(results);
  return results;
}

fetchAllDaysLive('2026-09-29', '2026-10-11', 2);
