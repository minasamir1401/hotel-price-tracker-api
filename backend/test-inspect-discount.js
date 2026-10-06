async function run() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const text = await res.text();
  const target = 'packageRateInfo.packageNightlyRates.length';
  const idx = text.indexOf(target);
  if (idx !== -1) {
    console.log('Snippet before and after target:');
    console.log(text.slice(Math.max(0, idx - 600), idx + 800));
  }
}
run();
