async function searchY() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/3638-615d4f8bafbadc33.js';
  const res = await fetch(url);
  const js = await res.text();
  
  const mIdx = js.indexOf('14951:');
  const snippet = js.substring(mIdx);
  const regex = /(?:let|var|const|function)\s+y\s*=/g;
  let match;
  while ((match = regex.exec(snippet)) !== null) {
    console.log('Match y at:', match.index);
    console.log(snippet.substring(match.index, match.index + 500));
  }
}

searchY().catch(console.error);
