import fs from 'fs';

async function findLU() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const text = await res.text();
  const idx = text.indexOf('GENERATE_PACKAGES_POLLING_ID');
  if (idx !== -1) {
    console.log(text.substring(Math.max(0, idx - 500), Math.min(text.length, idx + 500)));
  }
}

findLU();
