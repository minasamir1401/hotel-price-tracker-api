import fs from 'fs';

async function check() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const text = await res.text();
  
  const idx = text.indexOf('.generatePackagesPollingId(');
  if (idx !== -1) {
    console.log('Call to generatePackagesPollingId:');
    console.log(text.substring(Math.max(0, idx - 400), Math.min(text.length, idx + 400)));
  }

  // Also check what payload structure looks like in packages store
  const idx2 = text.indexOf('packagesPayload');
  if (idx2 !== -1) {
    console.log('packagesPayload:');
    console.log(text.substring(Math.max(0, idx2 - 200), Math.min(text.length, idx2 + 400)));
  }
}
check();
