async function run() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const text = await res.text();
  // Search for calls to is({
  const calls = [...text.matchAll(/is\(\{\s*pkg:/g)];
  console.log('is({ calls:', calls.length);
  for (const m of calls) {
    console.log(text.slice(Math.max(0, m.index - 200), m.index + 200));
    console.log('---');
  }

  // Also search for "discount"
  const discountCalls = [...text.matchAll(/discount:/g)];
  console.log('discount: count:', discountCalls.length);
}
run();
