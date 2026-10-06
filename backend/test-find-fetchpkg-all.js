async function run() {
  const htmlRes = await fetch('https://www.almosafer.com/ar/hotel/details/atg/kingsgate-hotel-deyar-1287944?checkin=20-10-2026&checkout=21-10-2026&rooms=3_adult&ncr=1');
  const html = await htmlRes.text();
  const scriptRegex = /src="([^"]+\.js)"/g;
  let match;
  const scripts = [];
  while ((match = scriptRegex.exec(html)) !== null) scripts.push(match[1]);

  for (const s of scripts) {
    const fullUrl = s.startsWith('http') ? s : 'https://www.almosafer.com' + s;
    const res = await fetch(fullUrl);
    const text = await res.text();
    if (text.includes('.fetchPackages(')) {
      console.log('Found .fetchPackages( in:', s);
      let idx = 0;
      while ((idx = text.indexOf('.fetchPackages(', idx + 1)) !== -1) {
        console.log('Snippet:', text.slice(Math.max(0, idx - 150), idx + 250));
        console.log('---');
      }
    }
  }
}
run();
