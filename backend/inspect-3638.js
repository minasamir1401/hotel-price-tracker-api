import fs from 'fs';

async function inspect3638() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/3638-615d4f8bafbadc33.js';
  const res = await fetch(url);
  const text = await res.text();
  console.log('Length:', text.length);
  fs.writeFileSync('backend/chunk_3638.js', text, 'utf8');

  // Search for fetch / axios / dispatch / action / url in 3638
  const matches = text.match(/(https?:\/\/[^\s"'`]+|\/api\/[^\s"'`]+|\/[a-zA-Z0-9_\-\/]+hotel[a-zA-Z0-9_\-\/]*)/g) || [];
  console.log('URLs/paths in 3638:', Array.from(new Set(matches)));

  // Look for any string containing "price" or "room"
  const strings = text.match(/["'][^"']*(?:hotel|room|price|rate)[^"']*["']/gi) || [];
  console.log('Strings count:', strings.length);
  console.log('Sample strings:', Array.from(new Set(strings)).slice(0, 30));
}

inspect3638();
