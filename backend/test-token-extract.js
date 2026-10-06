async function test() {
  const urls = [
    'https://www.almosafer.com/ar/hotel/details/atg/any-1287944?checkin=01-11-2026&checkout=02-11-2026',
    'https://www.almosafer.com/ar/hotel/details/atg/another-1798852?checkin=20-10-2026&checkout=21-10-2026',
    'https://www.almosafer.com/ar/hotel/details/atg/kingsgate-hotel-deyar-1287944?checkin=20-10-2026&checkout=21-10-2026&rooms=3_adult&ncr=1'
  ];
  for (const u of urls) {
    try {
      const res = await fetch(u, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'ar,en;q=0.9'
        }
      });
      const html = await res.text();
      const m = html.match(/"APIToken":\s*"([^"]+)"/);
      console.log(u.slice(-50), '=> APIToken:', m ? m[1] : 'NOT FOUND');
    } catch (e) {
      console.error(u, e.message);
    }
  }
}
test();
