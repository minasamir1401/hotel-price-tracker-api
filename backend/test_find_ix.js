async function findIX() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/3638-615d4f8bafbadc33.js';
  const res = await fetch(url);
  const js = await res.text();
  
  // Find where module 14737 is
  const idx = js.indexOf('14737:');
  console.log('14737 in chunk 3638:', idx);
  if (idx !== -1) {
    console.log(js.substring(idx, idx + 800));
  } else {
    // search in _app
    const appRes = await fetch('https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js');
    const appJs = await appRes.text();
    const aIdx = appJs.indexOf('14737:');
    console.log('14737 in _app:', aIdx);
    if (aIdx !== -1) {
      console.log(appJs.substring(aIdx, aIdx + 800));
    }
  }
}

findIX().catch(console.error);
