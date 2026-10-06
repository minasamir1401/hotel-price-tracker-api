import fs from 'fs';

const code = fs.readFileSync('backend/hotelDetails_chunk.js', 'utf8');

let pos = 0;
while ((pos = code.indexOf('/api/', pos)) !== -1) {
  console.log(code.substring(Math.max(0, pos - 50), Math.min(code.length, pos + 100)));
  pos += 5;
}

// Also check chunk 6580 or 3638 or 2372 where enigma was found
const otherChunks = ['2372-95638765eba4aa36.js', '6580-71f87b37fb77bcb9.js', '3638-615d4f8bafbadc33.js'];
async function checkOthers() {
  for (const c of otherChunks) {
    const res = await fetch(`https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/${c}`);
    const t = await res.text();
    let p = 0;
    while ((p = t.indexOf('/api/', p)) !== -1) {
      console.log(`[${c}]`, t.substring(Math.max(0, p - 50), Math.min(t.length, p + 100)));
      p += 5;
    }
  }
}
checkOthers();
