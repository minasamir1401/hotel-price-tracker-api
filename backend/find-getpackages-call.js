import fs from 'fs';

async function check() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const text = await res.text();
  
  // Search for .getPackages( or packages.fetch
  let idx = 0;
  while ((idx = text.indexOf('.getPackages(', idx)) !== -1) {
    console.log('Call to getPackages at', idx);
    console.log(text.substring(Math.max(0, idx - 300), Math.min(text.length, idx + 400)));
    idx += 12;
  }
}
check();
