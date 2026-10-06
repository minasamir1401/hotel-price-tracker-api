async function printL5() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/3638-615d4f8bafbadc33.js';
  const res = await fetch(url);
  const js = await res.text();
  
  const mIdx = js.indexOf('17448:');
  const modStr = js.substring(mIdx, mIdx + 3000);
  console.log(modStr);
}

printL5().catch(console.error);
