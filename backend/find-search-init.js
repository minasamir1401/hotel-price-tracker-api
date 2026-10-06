import fs from 'fs';

async function check() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const text = await res.text();
  
  const idx = text.indexOf('searchRequest:');
  if (idx !== -1) {
    console.log('searchRequest:');
    console.log(text.substring(Math.max(0, idx - 100), Math.min(text.length, idx + 400)));
  }

  // Also check packagesPayload or generatePackagesPollingId
  const idx2 = text.indexOf('generatePackagesPollingId(');
  if (idx2 !== -1) {
    console.log('where is generatePackagesPollingId called?');
    // find callers
    let pos = 0;
    while ((pos = text.indexOf('generatePackagesPollingId', pos)) !== -1) {
      console.log('At', pos, text.substring(Math.max(0, pos - 100), Math.min(text.length, pos + 300)));
      pos += 26;
    }
  }
}
check();
