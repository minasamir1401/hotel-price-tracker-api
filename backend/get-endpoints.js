async function getEndpoints() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const text = await res.text();
  const idx = text.indexOf('ENDPOINTS={');
  if (idx !== -1) {
    console.log(text.substring(idx, idx + 1200));
  }
}
getEndpoints();
