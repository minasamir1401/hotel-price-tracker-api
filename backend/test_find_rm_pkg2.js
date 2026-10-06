async function findRoomsPackagesMentions() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const js = await res.text();
  
  let idx = 0;
  while ((idx = js.indexOf('roomsPackages', idx)) !== -1) {
    console.log('=== Found roomsPackages ===');
    console.log(js.substring(Math.max(0, idx - 100), Math.min(js.length, idx + 250)));
    idx += 20;
    if (idx > 500000) break;
  }
}

findRoomsPackagesMentions().catch(console.error);
