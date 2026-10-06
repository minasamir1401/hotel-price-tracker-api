async function printFunctionI() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/3638-615d4f8bafbadc33.js';
  const res = await fetch(url);
  const js = await res.text();
  
  const mIdx = js.indexOf('14951:');
  const endModule = js.indexOf('329:', mIdx);
  const moduleJs = js.substring(mIdx, endModule !== -1 ? endModule : mIdx + 15000);
  
  // Find `function I(` or `let I=` or `const I=`
  let idx = 0;
  while ((idx = moduleJs.indexOf('I=', idx)) !== -1) {
    console.log('=== Found I= ===');
    console.log(moduleJs.substring(Math.max(0, idx - 50), Math.min(moduleJs.length, idx + 400)));
    idx += 5;
  }
}

printFunctionI().catch(console.error);
