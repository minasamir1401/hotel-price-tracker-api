import fs from 'fs';

const html = fs.readFileSync('backend/almosafer_page.html', 'utf8');

// Find all endpoints matching /api/ or similar
const re = /["'](\/[a-zA-Z0-9_\-\/]+api[a-zA-Z0-9_\-\/]*)["']/g;
let m;
const matches = new Set();
while ((m = re.exec(html)) !== null) {
  matches.add(m[1]);
}
console.log('API routes in strings:', Array.from(matches));

// Also search for any URLs containing almosafer
const reUrl = /https?:\/\/[a-zA-Z0-9_\-\.]*almosafer[a-zA-Z0-9_\-\.\/:]+/g;
let m2;
const urls = new Set();
while ((m2 = reUrl.exec(html)) !== null) {
  urls.add(m2[0]);
}
console.log('Almosafer URLs in HTML:', Array.from(urls).filter(u => u.includes('api') || u.includes('hotel')));
