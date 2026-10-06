async function printWholeY() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/3638-615d4f8bafbadc33.js';
  const res = await fetch(url);
  const js = await res.text();
  
  const mIdx = js.indexOf('14951:');
  const pos = mIdx + 23945;
  console.log(js.substring(pos, pos + 2000));
}

printWholeY().catch(console.error);
