async function printChunkRange() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/3638-615d4f8bafbadc33.js';
  const res = await fetch(url);
  const js = await res.text();
  console.log(js.substring(8693, 14000));
}

printChunkRange().catch(console.error);
