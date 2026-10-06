import fs from 'fs';

async function check() {
  const pageChunkUrl = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/%5Blang%5D/hotel/details/atg/%5B...hotelDetails%5D-cad91eb53016e496.js';
  const pageRes = await fetch(pageChunkUrl);
  const pageText = await pageRes.text();

  const idx = pageText.indexOf('jf');
  if (idx !== -1) {
    console.log('jf context:');
    let cur = 0;
    while ((cur = pageText.indexOf('.jf)(', cur)) !== -1) {
      console.log(pageText.substring(Math.max(0, cur - 100), Math.min(pageText.length, cur + 200)));
      cur += 5;
    }
  }

  // Find imports at the top
  const top = pageText.substring(0, 2000);
  console.log('Top of page chunk:');
  console.log(top);
}
check();
