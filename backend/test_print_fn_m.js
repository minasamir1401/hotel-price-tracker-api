async function printFunctionM() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/3638-615d4f8bafbadc33.js';
  const res = await fetch(url);
  const js = await res.text();
  
  const idx = js.indexOf('function M(e)');
  console.log(js.substring(idx, idx + 2500));
}

printFunctionM().catch(console.error);
