async function run() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const text = await res.text();
  const target = 'ei=ic({pkg:s,currency:p,discount:c';
  const idx = text.indexOf(target);
  if (idx !== -1) {
    // Look back from idx to find where c is defined
    console.log('Snippet before idx:');
    console.log(text.slice(Math.max(0, idx - 800), idx));
  }
}
run();
