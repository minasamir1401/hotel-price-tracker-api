async function findChunks() {
  const url = 'https://www.almosafer.com/ar/hotel/details/atg/%D9%81%D9%86%D8%AF%D9%83-%D9%83%D9%8A%D9%86%D8%AC%D8%B2%D8%AC%D9%8A%D8%AA-%D8%AF%D9%8A%D8%A7%D8%B1-1287944?checkin=01-10-2026&checkout=02-10-2026&rooms=2_adult&priceMode=total';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    }
  });

  const html = await res.text();
  const scriptRegex = /<script\s+[^>]*src="([^"]+)"/g;
  let m;
  const scripts = [];
  while ((m = scriptRegex.exec(html)) !== null) {
    if (m[1].includes('_next/static')) {
      scripts.push(m[1].startsWith('http') ? m[1] : 'https://www.almosafer.com' + m[1]);
    }
  }
  console.log('Found scripts:', scripts.length);

  for (const s of scripts) {
    if (s.includes('hotel') || s.includes('pages') || s.includes('main') || s.includes('app')) {
      try {
        const jsRes = await fetch(s);
        const js = await jsRes.text();
        if (js.includes('enigma') || js.includes('/packages')) {
          console.log('Script with enigma/packages:', s);
          // find occurrences of enigma
          let idx = 0;
          while ((idx = js.indexOf('enigma', idx)) !== -1) {
            console.log('Snippet:', js.substring(Math.max(0, idx - 80), Math.min(js.length, idx + 150)));
            idx += 10;
          }
        }
      } catch (e) {
        console.error('Error fetching script', s, e.message);
      }
    }
  }
}

findChunks().catch(console.error);
