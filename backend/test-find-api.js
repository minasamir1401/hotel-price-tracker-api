async function run() {
  const res = await fetch('https://www.almosafer.com/ar/hotel/details/atg/kingsgate-hotel-deyar-1287944?checkin=20-10-2026&checkout=21-10-2026&rooms=3_adult&ncr=1', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    }
  });
  const html = await res.text();
  const scriptRegex = /src="([^"]+\.js)"/g;
  let match;
  const scripts = [];
  while ((match = scriptRegex.exec(html)) !== null) {
    scripts.push(match[1]);
  }
  console.log('Total scripts found:', scripts.length);

  for (const s of scripts) {
    const fullUrl = s.startsWith('http') ? s : 'https://www.almosafer.com' + s;
    if (fullUrl.includes('hotel') || fullUrl.includes('enigma') || fullUrl.includes('detail') || fullUrl.includes('pages/hotel')) {
      console.log('Fetching script:', fullUrl);
      try {
        const sRes = await fetch(fullUrl);
        const sText = await sRes.text();
        // Search for api endpoints
        const apis = [...sText.matchAll(/\/api\/[a-zA-Z0-9_\-\/]+/g)].map(m => m[0]);
        const uniqueApis = [...new Set(apis)];
        console.log('APIs in', s.slice(s.lastIndexOf('/')), ':', uniqueApis);
      } catch (e) {
        console.error('Error fetching script:', e.message);
      }
    }
  }
}
run();
