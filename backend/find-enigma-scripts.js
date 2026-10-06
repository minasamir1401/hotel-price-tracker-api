import fs from 'fs';

const html = fs.readFileSync('backend/almosafer_page.html', 'utf8');
const scriptSrcs = [];
const re = /<script[^>]+src=["']([^"']+)["']/g;
let m;
while ((m = re.exec(html)) !== null) {
  if (m[1].endsWith('.js')) {
    scriptSrcs.push(m[1]);
  }
}

async function findEnigma() {
  for (const s of scriptSrcs) {
    const url = s.startsWith('http') ? s : `https://www.almosafer.com${s}`;
    try {
      const res = await fetch(url);
      const text = await res.text();
      if (text.includes('enigma') || text.includes('hotelDetails') || text.includes('hotel_details')) {
        console.log(`Matched in: ${s}`);
        // find snippet
        const idx = text.indexOf('enigma');
        if (idx !== -1) {
          console.log('Snippet:', text.substring(Math.max(0, idx - 100), Math.min(text.length, idx + 200)));
        }
      }
    } catch (e) {
      // ignore
    }
  }
}

findEnigma();
