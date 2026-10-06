import fs from 'fs';

async function check() {
  const pageChunkUrl = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/%5Blang%5D/hotel/details/atg/%5B...hotelDetails%5D-cad91eb53016e496.js';
  const pageRes = await fetch(pageChunkUrl);
  const pageText = await pageRes.text();

  const cur = pageText.indexOf('.jf)({');
  // Look backwards for Z = l(...)
  const before = pageText.substring(Math.max(0, cur - 10000), cur);
  const zMatches = before.match(/Z=l\(\d+\)/g) || [];
  console.log('Z matches:', zMatches);
  if (zMatches.length) {
    const modId = zMatches[zMatches.length - 1].match(/\d+/)[0];
    console.log('Module ID for Z:', modId);

    // Look for this module definition: modId: (
    const modIdx = pageText.indexOf(`${modId}:`);
    if (modIdx !== -1) {
      console.log('Module definition:', pageText.substring(modIdx, modIdx + 1000));
    }
  }
}
check();
