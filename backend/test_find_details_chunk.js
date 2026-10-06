async function findDetailsPageChunk() {
  const url = 'https://www.almosafer.com/ar/hotel/details/atg/%D9%81%D9%86%D8%AF%D9%83-%D9%83%D9%8A%D9%86%D8%AC%D8%B2%D8%AC%D9%8A%D8%AA-%D8%AF%D9%8A%D8%A7%D8%B1-1287944?checkin=01-10-2026&checkout=02-10-2026&rooms=2_adult&priceMode=total';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
  const html = await res.text();
  const scriptRegex = /<script\s+[^>]*src="([^"]+)"/g;
  let m;
  const scripts = [];
  while ((m = scriptRegex.exec(html)) !== null) {
    if (m[1].includes('_next/static')) {
      scripts.push(m[1].startsWith('http') ? m[1] : 'https://www.almosafer.com' + m[1]);
    }
  }

  for (const s of scripts) {
    if (s.includes('details') || s.includes('atg') || s.includes('pages')) {
      console.log('Candidate script:', s);
      const jsRes = await fetch(s);
      const js = await jsRes.text();
      let idx = 0;
      while ((idx = js.indexOf('.fetchPackages', idx)) !== -1) {
        console.log(`=== Found .fetchPackages in ${s} ===`);
        console.log(js.substring(Math.max(0, idx - 200), Math.min(js.length, idx + 400)));
        idx += 20;
      }
    }
  }
}

findDetailsPageChunk().catch(console.error);
