async function run() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const text = await res.text();
  const target = 'get formattedPackages(){';
  const idx = text.indexOf(target);
  console.log(text.slice(idx, idx + 1000));
}
run();
