async function findRoomsPackages() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/_app-a21b41d59ce521ba.js';
  const res = await fetch(url);
  const js = await res.text();
  
  let idx = 0;
  while ((idx = js.indexOf('this.roomsPackages=', idx)) !== -1) {
    console.log('=== Found this.roomsPackages= ===');
    console.log(js.substring(Math.max(0, idx - 150), Math.min(js.length, idx + 350)));
    idx += 20;
  }
}

findRoomsPackages().catch(console.error);
