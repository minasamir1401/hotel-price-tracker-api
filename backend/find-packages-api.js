import fs from 'fs';

async function findGetPackagesSearch() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const text = await res.text();
  const idx = text.indexOf('modifyGetPackagesSearch');
  if (idx !== -1) {
    console.log(text.substring(Math.max(0, idx - 150), Math.min(text.length, idx + 800)));
  }
}

findGetPackagesSearch();
