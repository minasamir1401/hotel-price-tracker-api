async function findFetchPackagesCallers() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const js = await res.text();
  
  let idx = 0;
  while ((idx = js.indexOf('fetchPackages', idx)) !== -1) {
    console.log('=== Found fetchPackages ===');
    console.log(js.substring(Math.max(0, idx - 150), Math.min(js.length, idx + 450)));
    idx += 20;
  }
}

findFetchPackagesCallers().catch(console.error);
