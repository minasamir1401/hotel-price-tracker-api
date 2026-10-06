import fs from 'fs';

async function inspectHtml() {
  const url = 'https://www.almosafer.com/ar/hotel/details/atg/%D9%81%D9%86%D8%AF%D9%83-%D9%83%D9%8A%D9%86%D8%AC%D8%B2%D8%AC%D9%8A%D8%AA-%D8%AF%D9%8A%D8%A7%D8%B1-1287944?checkin=01-10-2026&checkout=02-10-2026&rooms=2_adult&priceMode=total';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ar,en;q=0.9',
    }
  });

  const html = await res.text();
  // Find all occurrences of 1287944
  let matches = [];
  let pos = 0;
  while ((pos = html.indexOf('1287944', pos)) !== -1) {
    const start = Math.max(0, pos - 150);
    const end = Math.min(html.length, pos + 200);
    matches.push(html.substring(start, end).replace(/\n/g, ' '));
    pos += 7;
    if (matches.length >= 10) break;
  }
  console.log('Matches around 1287944:', matches);

  // Check for any API URLs inside HTML
  const apiMatches = html.match(/https?:\/\/[^"'\s]*api[^"'\s]*/g) || [];
  console.log('Unique API URLs in HTML:', [...new Set(apiMatches)].slice(0, 20));
}

inspectHtml().catch(console.error);
