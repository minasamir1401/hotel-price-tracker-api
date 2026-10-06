async function findHookSource() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/%5Blang%5D/hotel/details/atg/%5B...hotelDetails%5D-cad91eb53016e496.js';
  const res = await fetch(url);
  const js = await res.text();
  
  // Find where `groupedRoomsPackages:` is defined in any chunk!
  const scriptRegex = /<script\s+[^>]*src="([^"]+)"/g;
  const pageRes = await fetch('https://www.almosafer.com/ar/hotel/details/atg/%D9%81%D9%86%D8%AF%D9%83-%D9%83%D9%8A%D9%86%D8%AC%D8%B2%D8%AC%D9%8A%D8%AA-%D8%AF%D9%8A%D8%A7%D8%B1-1287944?checkin=01-10-2026&checkout=02-10-2026&rooms=2_adult&priceMode=total', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await pageRes.text();
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
      const idx = sJs.indexOf('groupedRoomsPackages:');
      if (idx !== -1) {
        console.log(`=== Found groupedRoomsPackages in ${s} ===`);
        console.log(sJs.substring(Math.max(0, idx - 300), Math.min(sJs.length, idx + 300)));
      }
    } catch (e) {}
  }
}

findHookSource().catch(console.error);
