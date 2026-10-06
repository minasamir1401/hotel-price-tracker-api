import fs from 'fs';

async function check() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const text = await res.text();
  
  // Find where GENERATE_PACKAGES_POLLING_ID is defined
  const idx = text.indexOf('GENERATE_PACKAGES_POLLING_ID:');
  if (idx !== -1) {
    console.log('lU definition:', text.substring(Math.max(0, idx - 100), Math.min(text.length, idx + 500)));
  }

  // Find pollPackages
  const idx2 = text.indexOf('pollPackages(');
  if (idx2 !== -1) {
    console.log('pollPackages definition:', text.substring(Math.max(0, idx2 - 50), Math.min(text.length, idx2 + 800)));
  }
}
check();
