async function getManifest() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/VRNsTzVtKc1KzDcB43KCC/_buildManifest.js';
  const res = await fetch(url);
  const text = await res.text();
  console.log(text.substring(0, 1000));
}
getManifest();
