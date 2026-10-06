async function searchExactY() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/3638-615d4f8bafbadc33.js';
  const res = await fetch(url);
  const js = await res.text();
  
  const mIdx = js.indexOf('14951:');
  const modStr = js.substring(mIdx, mIdx + 30000);
  
  // Find where `y` is assigned or declared
  const matches = [...modStr.matchAll(/\b(?:function\s+y|y\s*=\s*(?:function|\([^)]*\)\s*=>|\{))/g)];
  for (const m of matches) {
    console.log('Match at', m.index, ':', modStr.substring(m.index, m.index + 300));
  }
}

searchExactY().catch(console.error);
