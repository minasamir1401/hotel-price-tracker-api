async function printJf() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/3638-615d4f8bafbadc33.js';
  const res = await fetch(url);
  const js = await res.text();
  
  // In module 14951, jf: () => y
  // find definition of y or find where jf:()=>y is
  const idx = js.indexOf('jf:()=>y');
  console.log('Context of jf:()=>y:');
  const modIdx = js.indexOf('14951:');
  const modStr = js.substring(modIdx, modIdx + 15000);
  
  // Search for `function y` or `let y=` or `var y=` or `y = (` inside modStr
  let pos = 0;
  while ((pos = modStr.indexOf('y=', pos)) !== -1) {
    console.log('y= match:', modStr.substring(Math.max(0, pos - 30), Math.min(modStr.length, pos + 250)));
    pos += 5;
  }
}

printJf().catch(console.error);
