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

async function findHotelDetailsV2() {
  for (const s of scriptSrcs) {
    const url = s.startsWith('http') ? s : `https://www.almosafer.com${s}`;
    try {
      const res = await fetch(url);
      const text = await res.text();
      if (text.includes('hotelDetailsV2') && text.includes('packages')) {
        const idx = text.indexOf('modifySearch(');
        if (idx !== -1) {
          console.log(`[${s}] modifySearch def:`);
          console.log(text.substring(Math.max(0, idx - 100), Math.min(text.length, idx + 400)));
        }
      }
    } catch (e) {
      // ignore
    }
  }
}

findHotelDetailsV2();
