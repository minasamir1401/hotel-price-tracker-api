async function searchDb() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/3638-615d4f8bafbadc33.js';
  const res = await fetch(url);
  const js = await res.text();
  
  const idx = js.indexOf('dB:()=>');
  console.log('dB:()=> index:', idx);
  if (idx !== -1) {
    console.log(js.substring(idx - 50, idx + 100));
  }
}

searchDb().catch(console.error);
