import fs from 'fs';

async function check() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const text = await res.text();
  
  const idx = text.indexOf('getPackagesV7');
  if (idx !== -1) {
    console.log('getPackagesV7:');
    console.log(text.substring(Math.max(0, idx - 100), Math.min(text.length, idx + 600)));
  }

  // Also check chunk: pages/%5Blang%5D/hotel/details/atg/%5B...hotelDetails%5D-cad91eb53016e496.js
  const pageChunkUrl = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/%5Blang%5D/hotel/details/atg/%5B...hotelDetails%5D-cad91eb53016e496.js';
  const pageRes = await fetch(pageChunkUrl);
  const pageText = await pageRes.text();
  console.log('Page chunk contains fetchPackages?', pageText.includes('fetchPackages'));
  console.log('Page chunk contains packages.fetch?', pageText.includes('packages.fetch'));
  
  let pIdx = pageText.indexOf('packages');
  while (pIdx !== -1) {
    const snip = pageText.substring(Math.max(0, pIdx - 50), Math.min(pageText.length, pIdx + 200));
    if (snip.includes('fetch') || snip.includes('modify') || snip.includes('payload')) {
      console.log('Found in page chunk:', snip);
      break;
    }
    pIdx = pageText.indexOf('packages', pIdx + 8);
  }
}
check();
