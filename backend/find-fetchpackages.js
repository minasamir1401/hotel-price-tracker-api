import fs from 'fs';

async function check() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const text = await res.text();
  
  let idx = 0;
  while ((idx = text.indexOf('fetchPackages(', idx)) !== -1) {
    console.log('Call to fetchPackages at', idx);
    console.log(text.substring(Math.max(0, idx - 300), Math.min(text.length, idx + 400)));
    idx += 14;
  }
}
check();
