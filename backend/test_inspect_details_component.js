async function inspectDetailsComponent() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/%5Blang%5D/hotel/details/atg/%5B...hotelDetails%5D-cad91eb53016e496.js';
  const res = await fetch(url);
  const js = await res.text();
  console.log('Script size:', js.length);

  // Search for interesting keywords
  const keywords = ['packages', 'hotelId', 'checkIn', 'checkin', 'getPackages', 'sId', 'searchRequest'];
  for (const kw of keywords) {
    let count = 0;
    let pos = 0;
    while ((pos = js.indexOf(kw, pos)) !== -1) {
      count++;
      pos += kw.length;
    }
    console.log(`Keyword "${kw}": ${count} occurrences`);
  }

  // Find occurrences of getPackages or packages.fetch or similar
  let idx = 0;
  while ((idx = js.indexOf('Packages', idx)) !== -1) {
    console.log('--- Packages occurrence ---');
    console.log(js.substring(Math.max(0, idx - 100), Math.min(js.length, idx + 250)));
    idx += 8;
  }
}

inspectDetailsComponent().catch(console.error);
