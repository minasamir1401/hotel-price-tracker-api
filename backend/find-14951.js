import fs from 'fs';

async function check() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const text = await res.text();
  
  const idx = text.indexOf('14951:');
  if (idx !== -1) {
    console.log('Module 14951 found in _app:');
    console.log(text.substring(idx, Math.min(text.length, idx + 1500)));
  } else {
    console.log('14951 not in _app, checking chunk 3638...');
    const c3638 = fs.readFileSync('backend/chunk_3638.js', 'utf8');
    const idx2 = c3638.indexOf('14951:');
    if (idx2 !== -1) {
      console.log('14951 in chunk_3638:', c3638.substring(idx2, Math.min(c3638.length, idx2 + 1500)));
    }
  }
}
check();
