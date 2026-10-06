import fs from 'fs';

async function check() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const text = await res.text();
  
  const idx = text.indexOf('/api/enigma/v7/packages');
  if (idx !== -1) {
    console.log('Context around /api/enigma/v7/packages:');
    console.log(text.substring(Math.max(0, idx - 400), Math.min(text.length, idx + 400)));
  }

  const idx2 = text.indexOf('pollPackages(');
  if (idx2 !== -1) {
    // print further down in pollPackages
    console.log('pollPackages full code:');
    console.log(text.substring(idx2, Math.min(text.length, idx2 + 1500)));
  }
}
check();
