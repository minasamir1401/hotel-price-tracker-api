async function run() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/3638-615d4f8bafbadc33.js';
  const res = await fetch(url);
  const text = await res.text();
  // Find where dB is exported or defined
  const matches = [...text.matchAll(/dB:\s*\(\)\s*=>|function dB\b|dB\s*=\s*/g)];
  console.log('dB matches:', matches.length);
  for (const m of matches) {
    console.log(text.slice(Math.max(0, m.index - 50), m.index + 350));
    console.log('---');
  }
}
run();
