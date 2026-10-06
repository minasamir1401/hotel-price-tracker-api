async function printModuleFunctions() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/3638-615d4f8bafbadc33.js';
  const res = await fetch(url);
  const js = await res.text();
  
  const mIdx = js.indexOf('14951:');
  const endMod = js.indexOf('329:', mIdx);
  const modStr = js.substring(mIdx, endMod);
  
  // Search for `I=` or `I =` or `function I(`
  const regex = /([a-zA-Z0-9_$]+)\s*=\s*(?:function|\([^)]*\)\s*=>)/g;
  let m;
  const fns = [];
  while ((m = regex.exec(modStr)) !== null) {
    fns.push({ name: m[1], pos: m.index });
  }
  console.log('Functions found in module 14951:', fns.map(f => f.name));

  for (const f of fns) {
    if (f.name === 'I' || f.name === 'y') {
      console.log(`=== Function ${f.name} ===`);
      console.log(modStr.substring(f.pos, f.pos + 800));
    }
  }
}

printModuleFunctions().catch(console.error);
