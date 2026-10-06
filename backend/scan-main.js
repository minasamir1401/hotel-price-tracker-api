import fs from 'fs';

const chunks = [
  '7940-4ca222181ac1402f.js',
  '4354.ed80a5642f14e26a.js',
  '4206.98bf2971505ac29a.js',
  '7954.54d2427ae7c8cab2.js',
  'main-326d18f5bf3d16be.js'
];

async function scan() {
  for (const c of chunks) {
    const url = `https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/${c}`;
    try {
      const res = await fetch(url);
      const text = await res.text();
      console.log(`Chunk ${c}: ${text.length} bytes`);
      
      const regex = /https?:\/\/[a-zA-Z0-9_\-\.]+\/[a-zA-Z0-9_\-\.\/]+/g;
      let m;
      const found = new Set();
      while ((m = regex.exec(text)) !== null) {
        if (m[0].includes('hotel') || m[0].includes('api') || m[0].includes('enigma')) {
          found.add(m[0]);
        }
      }
      if (found.size > 0) {
        console.log(`Found in ${c}:`, Array.from(found));
      }
    } catch (e) {
      console.error(c, e.message);
    }
  }
}

scan();
