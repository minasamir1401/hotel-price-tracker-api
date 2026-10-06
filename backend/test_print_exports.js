async function printModuleExports() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/3638-615d4f8bafbadc33.js';
  const res = await fetch(url);
  const js = await res.text();
  
  const mIdx = js.indexOf('14951:');
  const nextMod = js.indexOf('\n', mIdx + 50);
  const snippet = js.substring(mIdx, mIdx + 10000);
  
  // Search for `I=` or `function I`
  const regex = /(?:var|let|const|function)\s+I\b/g;
  let match;
  while ((match = regex.exec(snippet)) !== null) {
    console.log('Match:', match[0], 'at pos', match.index);
    console.log(snippet.substring(match.index, match.index + 500));
  }
}

printModuleExports().catch(console.error);
