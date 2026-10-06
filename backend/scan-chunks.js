import fs from 'fs';

const chunks = [
  '1122-ac43a780992a7979.js',
  '3217-4ab370b1adbedcc4.js',
  '6115-03c07b5dea44d5b1.js',
  '8525-e9ae258bca467fbb.js',
  'pages/mweb/hotel/details/atg/[...hotelDetails]-ea678bee862c7068.js'
];

async function scan() {
  for (const c of chunks) {
    const url = `https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/${c}`;
    try {
      const res = await fetch(url);
      const text = await res.text();
      console.log(`Chunk ${c}: ${text.length} bytes`);
      
      const regex = /['"`]([^'"`]*(?:api|hotel|enigma|details)[^'"`]*)['"`]/gi;
      let m;
      const found = new Set();
      while ((m = regex.exec(text)) !== null) {
        if (m[1].length < 100 && (m[1].includes('/') || m[1].includes('api') || m[1].includes('http'))) {
          found.add(m[1]);
        }
      }
      if (found.size > 0) {
        console.log(`Found in ${c}:`, Array.from(found).slice(0, 10));
      }
    } catch (e) {
      console.error(c, e.message);
    }
  }
}

scan();
