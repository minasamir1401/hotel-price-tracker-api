import fs from 'fs';

async function findLK() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const text = await res.text();
  const idx = text.indexOf('lk=');
  if (idx !== -1) {
    console.log(text.substring(Math.max(0, idx - 100), Math.min(text.length, idx + 400)));
  } else {
    // search for lk.post
    const idx2 = text.indexOf('lk.post(');
    if (idx2 !== -1) {
      console.log(text.substring(Math.max(0, idx2 - 400), Math.min(text.length, idx2 + 100)));
    }
  }
}

findLK();
