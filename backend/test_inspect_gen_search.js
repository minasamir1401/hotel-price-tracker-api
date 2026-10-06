async function inspectGenerateSearchId() {
  const res = await fetch('https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js');
  const js = await res.text();
  
  const idx = js.indexOf('generateSearchId(e){');
  console.log(js.substring(idx, idx + 1000));
}

inspectGenerateSearchId().catch(console.error);
