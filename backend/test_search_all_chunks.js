async function searchAllChunksForWord(word) {
  const pageRes = await fetch('https://www.almosafer.com/ar/hotel/details/atg/%D9%81%D9%86%D8%AF%D9%83-%D9%83%D9%8A%D9%86%D8%AC%D8%B2%D8%AC%D9%8A%D8%AA-%D8%AF%D9%8A%D8%A7%D8%B1-1287944?checkin=01-10-2026&checkout=02-10-2026&rooms=2_adult&priceMode=total', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await pageRes.text();
  const scriptRegex = /<script\s+[^>]*src="([^"]+)"/g;
  let m;
  const scripts = [];
  while ((m = scriptRegex.exec(html)) !== null) {
    if (m[1].includes('_next/static')) {
      scripts.push(m[1].startsWith('http') ? m[1] : 'https://www.almosafer.com' + m[1]);
    }
  }

  for (const s of scripts) {
    try {
      const sRes = await fetch(s);
      const sJs = await sRes.text();
      let idx = 0;
      let count = 0;
      while ((idx = sJs.indexOf(word, idx)) !== -1) {
        count++;
        if (count <= 3) {
          console.log(`=== Found "${word}" in ${s} ===`);
          console.log(sJs.substring(Math.max(0, idx - 150), Math.min(sJs.length, idx + 350)));
        }
        idx += word.length + 10;
      }
    } catch (e) {}
  }
}

searchAllChunksForWord('fetchPackages').catch(console.error);
