async function printNextM() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/3638-615d4f8bafbadc33.js';
  const res = await fetch(url);
  const js = await res.text();
  
  const idx = js.indexOf('let ep=(0,n.useRef)');
  console.log(js.substring(idx, idx + 2500));
}

printNextM().catch(console.error);
