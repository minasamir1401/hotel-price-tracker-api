import fs from 'fs';

async function check() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const text = await res.text();
  
  const idx = text.indexOf('setSearchRequest(){');
  if (idx !== -1) {
    console.log('setSearchRequest:');
    console.log(text.substring(idx, Math.min(text.length, idx + 500)));
  }
}
check();
