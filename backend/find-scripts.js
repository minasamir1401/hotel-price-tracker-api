import fs from 'fs';

const html = fs.readFileSync('backend/almosafer_page.html', 'utf8');

const scriptSrcs = [];
const re = /<script[^>]+src=["']([^"']+)["']/g;
let m;
while ((m = re.exec(html)) !== null) {
  scriptSrcs.push(m[1]);
}
console.log('Script srcs:', scriptSrcs);
