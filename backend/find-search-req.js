import fs from 'fs';

async function check() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const text = await res.text();
  
  // Find where generatePackagesPollingIdV7 is called
  const idx = text.indexOf('generatePackagesPollingIdV7');
  if (idx !== -1) {
    console.log('generatePackagesPollingIdV7 definition and surroundings:');
    console.log(text.substring(Math.max(0, idx - 200), Math.min(text.length, idx + 600)));
  }

  // Find where search request or packages payload is constructed
  const idx2 = text.indexOf('setSearchRequest');
  if (idx2 !== -1) {
    console.log('setSearchRequest:');
    console.log(text.substring(Math.max(0, idx2 - 100), Math.min(text.length, idx2 + 400)));
  }
}
check();
