import fs from 'fs';

const raw = fs.readFileSync('next_data.json', 'utf8');
const data = JSON.parse(raw);

console.log('Page:', data.page);
console.log('Query:', data.query);
console.log('props.pageProps keys:', Object.keys(data.props?.pageProps || {}));

// Search for 397 and 524
const has397 = raw.includes('397');
const has524 = raw.includes('524');
console.log('raw has 397:', has397, 'has 524:', has524);

// Find occurrences of numbers
function findOccurrences(term) {
  let idx = 0;
  while ((idx = raw.indexOf(term, idx)) !== -1) {
    console.log(`Found "${term}":`, raw.substring(Math.max(0, idx - 80), Math.min(raw.length, idx + 120)));
    idx += term.length + 1;
  }
}

if (has397) findOccurrences('397');
if (has524) findOccurrences('524');
