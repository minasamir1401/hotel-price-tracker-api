async function findL5InChunk() {
  const res = await fetch('https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/3638-615d4f8bafbadc33.js');
  const js = await res.text();
  let idx = 0;
  while ((idx = js.indexOf('L5:', idx)) !== -1) {
    console.log('Found L5: in chunk at', idx);
    console.log(js.substring(idx - 50, idx + 400));
    idx += 5;
  }
}

findL5InChunk().catch(console.error);
