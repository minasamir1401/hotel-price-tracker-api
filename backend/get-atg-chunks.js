import fs from 'fs';

const manifest = fs.readFileSync('backend/fetch-manifest.js', 'utf8');

async function getFullManifest() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/VRNsTzVtKc1KzDcB43KCC/_buildManifest.js';
  const res = await fetch(url);
  const text = await res.text();
  const atgIndex = text.indexOf('/hotel/details/atg/[...hotelDetails]');
  if (atgIndex !== -1) {
    console.log(text.substring(atgIndex, atgIndex + 500));
  }
}

getFullManifest();
