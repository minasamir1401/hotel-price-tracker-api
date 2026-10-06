async function findFetchPackagesCall() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/%5Blang%5D/hotel/details/atg/%5B...hotelDetails%5D-cad91eb53016e496.js';
  const res = await fetch(url);
  const js = await res.text();
  
  // Search for `fetchPackages`
  let idx = 0;
  while ((idx = js.indexOf('fetchPackages', idx)) !== -1) {
    console.log('=== Found fetchPackages in details page ===');
    console.log(js.substring(Math.max(0, idx - 150), Math.min(js.length, idx + 350)));
    idx += 20;
  }
}

findFetchPackagesCall().catch(console.error);
