async function inspectChunk3638() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/3638-615d4f8bafbadc33.js';
  const res = await fetch(url);
  const js = await res.text();
  
  const idx = js.indexOf('d.dB');
  if (idx !== -1) {
    console.log('Context around d.dB:');
    console.log(js.substring(Math.max(0, idx - 400), Math.min(js.length, idx + 800)));
  }
}

inspectChunk3638().catch(console.error);
