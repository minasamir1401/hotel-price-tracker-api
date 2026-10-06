async function run() {
  const url = 'https://www.almosafer.com/ar/hotel/details/atg/kingsgate-hotel-deyar-1287944?checkin=20-10-2026&checkout=21-10-2026&rooms=3_adult&ncr=1';
  const res = await fetch(url);
  const text = await res.text();
  console.log('in HTML:', text.includes('skdjfh73273$7268u2j89s'));
  
  // Search in all scripts in the HTML
  const scriptRegex = /<script\b[^>]*src="([^"]+)"[^>]*>/gi;
  let match;
  while ((match = scriptRegex.exec(text)) !== null) {
    const src = match[1];
    const sUrl = src.startsWith('http') ? src : 'https://www.almosafer.com' + src;
    try {
      const sRes = await fetch(sUrl);
      const sText = await sRes.text();
      if (sText.includes('skdjfh73273$7268u2j89s')) {
        console.log('FOUND TOKEN IN SCRIPT:', sUrl);
      }
      if (sText.includes('4R!eVj7$&7Q8Duhv1#pB')) {
        console.log('FOUND OLD TOKEN IN SCRIPT:', sUrl);
      }
    } catch (e) {
      console.error('Error fetching', sUrl, e.message);
    }
  }

  const nextMatch = text.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextMatch) {
    const data = JSON.parse(nextMatch[1]);
    function search(obj, path) {
      if (!obj) return;
      if (typeof obj === 'string' && obj.includes('skdjfh73273$7268u2j89s')) {
        console.log('FOUND AT PATH:', path, '=>', obj);
      }
      if (typeof obj === 'object') {
        for (const k of Object.keys(obj)) {
          search(obj[k], path ? `${path}.${k}` : k);
        }
      }
    }
    search(data, '');
  }
}
run();
