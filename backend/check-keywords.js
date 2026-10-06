import fs from 'fs';

const html = fs.readFileSync('backend/almosafer_page.html', 'utf8');

const keywords = ['tajawal', 'seera', 'hotel-search', 'hotels/search', 'getHotel', 'property', 'checkin', 'room_type', 'rates', 'availability', 'pricing'];

for (const kw of keywords) {
  let count = 0;
  let pos = 0;
  while ((pos = html.indexOf(kw, pos)) !== -1) {
    count++;
    pos += kw.length;
  }
  console.log(`${kw}: ${count}`);
}
