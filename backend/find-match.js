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

async function findMatch() {
  for (const s of scriptSrcs) {
    const url = s.startsWith('http') ? s : `https://www.almosafer.com${s}`;
    try {
      const res = await fetch(url);
      const text = await res.text();
      for (const kw of ['hotelDetails', 'lookup', 'details/atg', 'search/hotel', 'hotels/search', 'rates']) {
        if (text.includes(kw)) {
          const idx = text.indexOf(kw);
          console.log(`[${s}] matched "${kw}":`, text.substring(Math.max(0, idx - 40), Math.min(text.length, idx + 120)));
          break;
        }
      }
    } catch (e) {
      // ignore
    }
  }
}

findMatch();
