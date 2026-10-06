import fs from 'fs';

async function check() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const text = await res.text();
  
  // Find where .fetchPackages is called
  let pos = 0;
  while ((pos = text.indexOf('.fetchPackages(', pos)) !== -1) {
    console.log('Call to .fetchPackages at', pos);
    console.log(text.substring(Math.max(0, pos - 150), Math.min(text.length, pos + 350)));
    pos += 15;
  }
}
check();
