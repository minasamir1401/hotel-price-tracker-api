async function run() {
  const url = 'https://www.almosafer.com/ar/hotel/details/atg/kingsgate-hotel-deyar-1287944?checkin=20-10-2026&checkout=21-10-2026&rooms=3_adult&ncr=1';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept-Language': 'ar,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }
  });
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Page length:', text.length);

  const idx808 = text.indexOf('808');
  console.log('Index of 808 in HTML:', idx808);
  if (idx808 !== -1) {
    console.log('Snippet around 808:', text.slice(Math.max(0, idx808 - 200), idx808 + 200));
  }

  const idx936 = text.indexOf('936');
  console.log('Index of 936 in HTML:', idx936);

  const nextMatch = text.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextMatch) {
    try {
      const data = JSON.parse(nextMatch[1]);
      console.log('NextData buildId:', data.buildId);
      const str = JSON.stringify(data);
      console.log('Contains 808 in NextData?', str.includes('808'));
      console.log('Contains 936 in NextData?', str.includes('936'));
      console.log('Contains 1107 in NextData?', str.includes('1107'));
      console.log('Contains 1,107 in NextData?', str.includes('1,107'));
    } catch (e) {
      console.error('Error parsing next data:', e);
    }
  }
}
run();
