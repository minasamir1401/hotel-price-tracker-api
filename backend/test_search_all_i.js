async function searchAllI() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/3638-615d4f8bafbadc33.js';
  const res = await fetch(url);
  const js = await res.text();
  
  const mIdx = js.indexOf('14951:');
  const snippet = js.substring(mIdx, mIdx + 20000);
  
  // Look for `let I` or `var I` or `I=`
  let idx = 0;
  while ((idx = snippet.indexOf('I(', idx)) !== -1) {
    console.log('I( occurrence:', snippet.substring(Math.max(0, idx - 40), Math.min(snippet.length, idx + 100)));
    idx += 5;
  }
}

searchAllI().catch(console.error);
