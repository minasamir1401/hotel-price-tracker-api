async function inspectJf() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/3638-615d4f8bafbadc33.js';
  const res = await fetch(url);
  const js = await res.text();
  
  // Find where `jf:` or function `y` is defined in chunk 3638
  const mIdx = js.indexOf('14951:');
  const chunkSnippet = js.substring(mIdx);
  // Find `function y` or where `y` is
  let idx = 0;
  while ((idx = chunkSnippet.indexOf('y=', idx)) !== -1) {
    console.log('y= at', idx);
    console.log(chunkSnippet.substring(idx - 30, idx + 400));
    idx += 5;
    if (idx > 5000) break;
  }
}

inspectJf().catch(console.error);
