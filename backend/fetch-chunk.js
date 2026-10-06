import fs from 'fs';

async function fetchChunk() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/%5Blang%5D/hotel/details/atg/%5B...hotelDetails%5D-cad91eb53016e496.js';
  const res = await fetch(url);
  const text = await res.text();
  console.log('Chunk length:', text.length);
  fs.writeFileSync('backend/hotelDetails_chunk.js', text, 'utf8');

  // Search for endpoints or paths
  const matches = text.match(/(https?:\/\/[^\s"'`]+|\/api\/[^\s"'`]+|\/hotel\/[^\s"'`]+)/g) || [];
  console.log('Endpoints found:', Array.from(new Set(matches)).slice(0, 30));
  
  // Search for post, get or fetch calls
  const apiCalls = text.match(/[\w\.\$]+\.(post|get)\(["'`]([^"'`]+)["'`]/g) || [];
  console.log('API calls:', Array.from(new Set(apiCalls)).slice(0, 30));
}

fetchChunk();
