async function run() {
  const token = 'skdjfh73273$7268u2j89s';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'Origin': 'https://www.almosafer.com',
    'token': token,
    'x-authorization': token,
    'x-api-key': 'apikey-hotel',
    'x-app-name': 'ct-web-hotels-app',
    'x-bt': 'next',
    'x-platform': 'web',
    'x-currency': 'SAR',
    'x-locale': 'ar',
    'general-key': 'general-key'
  };

  const dates = [
    { in: '2026-10-20', out: '2026-10-21' },
    { in: '2026-10-05', out: '2026-10-06' }
  ];

  for (const d of dates) {
    const payload = {
      checkIn: d.in,
      checkOut: d.out,
      hotelId: 1287944,
      roomsInfo: [{ adultsCount: 3, kidsAges: [] }],
      variant: 'control'
    };

    console.log(`\n=== Querying ${d.in} ===`);
    const initRes = await fetch('https://www.almosafer.com/api/enigma/v7/packages', {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload)
    });

    const init = await initRes.json();
    console.log('init pId:', init.pId);

    if (!init.pId || init.pId.startsWith('no-pkg')) {
      console.log('No package pId');
      continue;
    }

    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const pollRes = await fetch(`https://www.almosafer.com/api/enigma/v7/packages/poll/${encodeURIComponent(init.pId)}`, { headers });
      const poll = await pollRes.json();
      if (poll.pollingStatus === 'COMPLETED_SUCCESSFULLY') {
        const groups = poll.packagesGroups || [];
        console.log(`Poll finished. Groups: ${groups.length}`);
        for (const g of groups) {
          console.log(`Group: ${g.title?.ar || g.title?.en}`);
          for (const p of g.packages || []) {
            console.log(`  Pkg ${p.rooms?.[0]?.roomBasis}: total = ${p.packageRateInfo?.total}`);
          }
        }
        break;
      }
    }
  }
}

run();
