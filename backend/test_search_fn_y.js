async function searchFnY() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/3638-615d4f8bafbadc33.js';
  const res = await fetch(url);
  const js = await res.text();
  
  const mIdx = js.indexOf('14951:');
  const snippet = js.substring(mIdx);
  let idx = 0;
  while ((idx = snippet.indexOf('function y(', idx)) !== -1) {
    console.log('Found function y(', snippet.substring(idx, idx + 800));
    idx += 10;
  }
}

searchFnY().catch(console.error);
