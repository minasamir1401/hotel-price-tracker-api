import fs from 'fs';

async function check() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const text = await res.text();
  const idx = text.indexOf('17448:');
  if (idx !== -1) {
    console.log(text.substring(idx, idx + 1000));
  } else {
    // search L5:()=>
    const l5Idx = text.indexOf('L5:()=>');
    if (l5Idx !== -1) {
      console.log(text.substring(l5Idx - 50, l5Idx + 400));
    }
  }
}
check();
