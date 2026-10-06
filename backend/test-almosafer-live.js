import fs from 'fs';

async function test() {
  try {
    const url = 'https://www.almosafer.com/ar/hotel/details/atg/%D9%85%D9%8A%D9%84%D9%8A%D9%86%D9%8A%D9%88%D9%85-%D9%85%D9%83%D8%A9-%D8%A7%D9%84%D9%86%D8%B3%D9%8A%D9%85-1798852?checkin=15-10-2026&checkout=16-10-2026&rooms=2_adult&priceMode=total&lang=ar';
    console.log('Fetching:', url);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'ar,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    console.log('Status:', res.status);
    const html = await res.text();
    console.log('HTML Length:', html.length);
    fs.writeFileSync('backend/almosafer_page.html', html, 'utf8');

    // Look for __NEXT_DATA__
    const marker = '<script id="__NEXT_DATA__" type="application/json">';
    const idx = html.indexOf(marker);
    if (idx !== -1) {
      const endIdx = html.indexOf('</script>', idx);
      const jsonStr = html.substring(idx + marker.length, endIdx);
      fs.writeFileSync('backend/almosafer_next_data.json', jsonStr, 'utf8');
      const data = JSON.parse(jsonStr);
      console.log('__NEXT_DATA__ parsed successfully!');
      console.log('pageProps keys:', Object.keys(data.props?.pageProps || {}));
      if (data.props?.pageProps?.hotelData) {
        console.log('hotelData found!');
      }
    } else {
      console.log('__NEXT_DATA__ not found');
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
