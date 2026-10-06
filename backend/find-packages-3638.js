import fs from 'fs';

const text = fs.readFileSync('backend/chunk_3638.js', 'utf8');
let pos = 0;
while ((pos = text.indexOf('packages', pos)) !== -1) {
  const snip = text.substring(Math.max(0, pos - 80), Math.min(text.length, pos + 150));
  if (snip.includes('fetch') || snip.includes('modify') || snip.includes('init') || snip.includes('get')) {
    console.log('Match at', pos, snip);
  }
  pos += 8;
}
