async function findHeadersConfig() {
  const res = await fetch('https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js');
  const js = await res.text();
  
  const idx = js.indexOf('apikey-hotel');
  console.log('apikey-hotel index:', idx);
  if (idx !== -1) {
    console.log(js.substring(idx - 200, idx + 400));
  }
}

findHeadersConfig().catch(console.error);
