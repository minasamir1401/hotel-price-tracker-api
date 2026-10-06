import fs from 'fs';

async function check() {
  const pageChunkUrl = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/%5Blang%5D/hotel/details/atg/%5B...hotelDetails%5D-cad91eb53016e496.js';
  const pageRes = await fetch(pageChunkUrl);
  const pageText = await pageRes.text();

  const idx = pageText.indexOf('packages.modifySearch');
  if (idx !== -1) {
    console.log('packages.modifySearch context:');
    console.log(pageText.substring(Math.max(0, idx - 400), Math.min(pageText.length, idx + 400)));
  }

  // Also where is Z defined or imported?
  // Let's find function definitions in this chunk that return payload objects
  const payloadMatches = pageText.match(/function [a-zA-Z0-9_]+\([^\)]*\)\{return\{[^}]*checkin[^}]*\}\}/g) || [];
  console.log('Payload functions:', payloadMatches);
}
check();
