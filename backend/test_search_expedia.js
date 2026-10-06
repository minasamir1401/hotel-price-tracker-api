async function searchSupplier() {
  const res = await fetch('https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js');
  const js = await res.text();
  
  let idx = 0;
  while ((idx = js.indexOf('EXPEDIA', idx)) !== -1) {
    console.log('Found EXPEDIA in _app at', idx);
    console.log(js.substring(Math.max(0, idx - 100), Math.min(js.length, idx + 200)));
    idx += 7;
  }
}

searchSupplier().catch(console.error);
