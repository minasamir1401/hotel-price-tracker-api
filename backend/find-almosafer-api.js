import fs from 'fs';

function searchFile(filename) {
  if (!fs.existsSync(filename)) return;
  const content = fs.readFileSync(filename, 'utf8');
  console.log(`Searching in ${filename}...`);
  
  const apiMatches = content.match(/\/api\/[a-zA-Z0-9_\-\.\/]+/g) || [];
  console.log('API endpoints:', Array.from(new Set(apiMatches)));

  const urlMatches = content.match(/https?:\/\/[a-zA-Z0-9_\-\.\/]+/g) || [];
  console.log('URLs:', Array.from(new Set(urlMatches)).slice(0, 10));

  const postMatches = content.match(/post\([^\)]+\)/g) || [];
  console.log('POST calls:', postMatches.slice(0, 5));
}

searchFile('backend/hotelDetails_chunk.js');
searchFile('backend/chunk_3638.js');
