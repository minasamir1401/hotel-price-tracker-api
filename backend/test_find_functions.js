async function findFunctionsEeEt() {
  const res = await fetch('https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js');
  const js = await res.text();
  
  const idx = 459736;
  console.log(js.substring(idx + 300, idx + 1800));
}

findFunctionsEeEt().catch(console.error);
