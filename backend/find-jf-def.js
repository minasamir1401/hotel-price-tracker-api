import fs from 'fs';

async function check() {
  const pageChunkUrl = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/%5Blang%5D/hotel/details/atg/%5B...hotelDetails%5D-cad91eb53016e496.js';
  const pageRes = await fetch(pageChunkUrl);
  const pageText = await pageRes.text();

  const cur = pageText.indexOf('.jf)({');
  if (cur !== -1) {
    console.log(pageText.substring(Math.max(0, cur - 300), Math.min(pageText.length, cur + 300)));
  }

  // Find where jf is defined: "jf:()=>"
  const jfIdx = pageText.indexOf('jf:()=>');
  if (jfIdx !== -1) {
    console.log('jf defined here:');
    console.log(pageText.substring(Math.max(0, jfIdx - 100), Math.min(pageText.length, jfIdx + 500)));
  }
}
check();
