async function findEeEt() {
  const res = await fetch('https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js');
  const js = await res.text();
  
  const idx = 459736;
  console.log(js.substring(idx - 1500, idx));
}

findEeEt().catch(console.error);
