async function run() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const text = await res.text();
  const matches = [...text.matchAll(/discountPercentage/g)];
  console.log('discountPercentage occurrences:', matches.length);
  for (const m of matches) {
    console.log(text.slice(Math.max(0, m.index - 200), m.index + 300));
    console.log('===');
  }
}
run();
