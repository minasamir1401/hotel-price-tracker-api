import fs from 'fs';

async function check() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const text = await res.text();
  
  // Find where x-Authorization or Bearer is used
  let pos = 0;
  while ((pos = text.indexOf('x-Authorization', pos)) !== -1) {
    console.log('x-Authorization at', pos);
    console.log(text.substring(Math.max(0, pos - 150), Math.min(text.length, pos + 250)));
    pos += 16;
  }

  let pos2 = 0;
  while ((pos2 = text.indexOf('Bearer ', pos2)) !== -1) {
    console.log('Bearer at', pos2);
    console.log(text.substring(Math.max(0, pos2 - 100), Math.min(text.length, pos2 + 200)));
    pos2 += 8;
  }
}
check();
