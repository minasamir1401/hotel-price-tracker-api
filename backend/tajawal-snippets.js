import fs from 'fs';

const html = fs.readFileSync('backend/almosafer_page.html', 'utf8');

let pos = 0;
let count = 0;
while ((pos = html.indexOf('tajawal', pos)) !== -1 && count < 10) {
  const start = Math.max(0, pos - 150);
  const end = Math.min(html.length, pos + 250);
  console.log(`\n=== tajawal snippet ${count + 1} ===`);
  console.log(html.substring(start, end));
  pos += 7;
  count++;
}
