async function run() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/3638-615d4f8bafbadc33.js';
  const res = await fetch(url);
  const text = await res.text();
  const target = 'function I(';
  const idx = text.indexOf(target);
  console.log(text.slice(idx, idx + 800));
}
run();
