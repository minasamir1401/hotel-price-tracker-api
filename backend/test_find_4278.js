async function findL5() {
  const appRes = await fetch('https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js');
  const appJs = await appRes.text();
  const aIdx = appJs.indexOf('4278:');
  console.log('4278 in _app:', aIdx);
  if (aIdx !== -1) {
    console.log(appJs.substring(aIdx, aIdx + 800));
  }
}

findL5().catch(console.error);
