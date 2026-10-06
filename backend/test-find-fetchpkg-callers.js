async function run() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const text = await res.text();
  const target = 'fetchPackages(';
  let idx = 0;
  while ((idx = text.indexOf(target, idx + 1)) !== -1) {
    console.log('fetchPackages caller:');
    console.log(text.slice(Math.max(0, idx - 400), idx + 200));
    console.log('---');
  }
}
run();
