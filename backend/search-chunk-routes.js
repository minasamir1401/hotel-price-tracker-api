import fs from 'fs';

const code = fs.readFileSync('backend/hotelDetails_chunk.js', 'utf8');

const regex = /['"`]([^'"`]*(?:enigma|hotel|lookup|details|rate)[^'"`]*)['"`]/gi;
let m;
const matches = new Set();
while ((m = regex.exec(code)) !== null) {
  if (m[1].length < 100 && (m[1].includes('/') || m[1].includes('api'))) {
    matches.add(m[1]);
  }
}
console.log('Matches:', Array.from(matches));
