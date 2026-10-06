async function findDbDef() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/3638-615d4f8bafbadc33.js';
  const res = await fetch(url);
  const js = await res.text();
  
  // Find import of `d` or definition of dB
  let idx = 0;
  while ((idx = js.indexOf('dB=', idx)) !== -1) {
    console.log('=== Found dB= ===');
    console.log(js.substring(Math.max(0, idx - 100), Math.min(js.length, idx + 300)));
    idx += 5;
  }

  // Also check module imports at top of file
  console.log('Start of chunk 3638:', js.substring(0, 500));
}

findDbDef().catch(console.error);
