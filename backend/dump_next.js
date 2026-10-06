import fs from 'fs';

async function dumpNextData() {
  const url = 'https://www.almosafer.com/ar/hotel/details/atg/%D9%81%D9%86%D8%AF%D9%83-%D9%83%D9%8A%D9%86%D8%AC%D8%B2%D8%AC%D9%8A%D8%AA-%D8%AF%D9%8A%D8%A7%D8%B1-1287944?checkin=01-10-2026&checkout=02-10-2026&rooms=2_adult&priceMode=total';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
  const html = await res.text();
  const marker = '<script id="__NEXT_DATA__" type="application/json">';
  const idx = html.indexOf(marker);
  if (idx !== -1) {
    const endIdx = html.indexOf('</script>', idx);
    const jsonStr = html.substring(idx + marker.length, endIdx);
    fs.writeFileSync('next_data.json', jsonStr, 'utf8');
    console.log('Saved next_data.json, size:', jsonStr.length);
  }
}

dumpNextData().catch(console.error);
