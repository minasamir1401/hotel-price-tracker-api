async function run() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const text = await res.text();
  const target = 'ei=ic({pkg:s';
  const idx = text.indexOf(target);
  // Find where ic is defined
  const icMatches = [...text.matchAll(/function ic\b|var ic=|const ic=|let ic=/g)];
  console.log('ic definitions:', icMatches.length);
  for (const m of icMatches) {
    console.log(text.slice(m.index, m.index + 500));
    console.log('---');
  }

  // Also let's find where 'discount:c' comes from, where is 'c' defined in this scope?
  const funcStart = text.lastIndexOf('function', idx);
  console.log('Scope snippet before idx:', text.slice(Math.max(0, idx - 1500), idx));
}
run();
