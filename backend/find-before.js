import fs from 'fs';

async function check() {
  const pageChunkUrl = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/%5Blang%5D/hotel/details/atg/%5B...hotelDetails%5D-cad91eb53016e496.js';
  const pageRes = await fetch(pageChunkUrl);
  const pageText = await pageRes.text();

  const cur = pageText.indexOf('.jf)({');
  // print 2000 chars before cur
  console.log('Before cur:');
  console.log(pageText.substring(Math.max(0, cur - 2500), cur));
}
check();
