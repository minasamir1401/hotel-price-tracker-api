async function run() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const text = await res.text();
  const target = 'GENERATE_PACKAGES_POLLING_ID_V7';
  let idx = 0;
  while ((idx = text.indexOf(target, idx + 1)) !== -1) {
    console.log('Occurrence:', text.slice(Math.max(0, idx - 100), idx + 400));
    console.log('---');
  }
}
run();
