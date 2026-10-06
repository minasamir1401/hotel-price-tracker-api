async function inspectModifySearch() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const js = await res.text();
  
  let idx = 0;
  while ((idx = js.indexOf('modifySearch(e){', idx)) !== -1) {
    console.log('=== Found modifySearch(e){ ===');
    console.log(js.substring(idx, idx + 1200));
    idx += 15;
  }
}

inspectModifySearch().catch(console.error);
