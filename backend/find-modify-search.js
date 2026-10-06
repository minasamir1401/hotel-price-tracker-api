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

async function findModifySearch() {
  for (const s of scriptSrcs) {
    const url = s.startsWith('http') ? s : `https://www.almosafer.com${s}`;
    try {
      const res = await fetch(url);
      const text = await res.text();
      if (text.includes('modifySearch') || text.includes('groupedRoomsPackages')) {
        console.log(`Matched in: ${s}`);
        const idx = text.indexOf('modifySearch');
        if (idx !== -1) {
          console.log('modifySearch snippet:', text.substring(Math.max(0, idx - 80), Math.min(text.length, idx + 180)));
        }
      }
    } catch (e) {
      // ignore
    }
  }
}

findModifySearch();
