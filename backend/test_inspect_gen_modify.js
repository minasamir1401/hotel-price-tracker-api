async function inspectGenerateModify() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const js = await res.text();
  
  let idx = 0;
  while ((idx = js.indexOf('generateModifySearchPollingIdV7', idx)) !== -1) {
    console.log('=== Found generateModifySearchPollingIdV7 ===');
    console.log(js.substring(Math.max(0, idx - 50), Math.min(js.length, idx + 400)));
    idx += 30;
  }
}

inspectGenerateModify().catch(console.error);
