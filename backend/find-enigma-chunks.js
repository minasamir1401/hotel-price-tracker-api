const chunks = [
  '4507.2e8926cc7f891b5c.js',
  '954.bdd149b8dd9f4d8d.js',
  '2658.edc856c41193bac9.js',
  '5559.599a6b3a3e6ea651.js',
  '6914.f8eb915b5448b0a6.js',
  '3725.f5930b69960422fc.js',
  '2372-95638765eba4aa36.js',
  '6580-71f87b37fb77bcb9.js',
  '3638-615d4f8bafbadc33.js'
];

async function scanEnigma() {
  for (const c of chunks) {
    const res = await fetch(`https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/${c}`);
    const t = await res.text();
    let p = 0;
    while ((p = t.indexOf('enigma', p)) !== -1) {
      console.log(`[${c}]`, t.substring(Math.max(0, p - 60), Math.min(t.length, p + 140)));
      p += 6;
    }
  }
}
scanEnigma();
