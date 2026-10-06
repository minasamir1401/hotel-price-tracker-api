async function findHookB() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/%5Blang%5D/hotel/details/atg/%5B...hotelDetails%5D-cad91eb53016e496.js';
  const res = await fetch(url);
  const js = await res.text();
  
  const idx = js.indexOf('groupedRoomsPackages');
  if (idx !== -1) {
    console.log('Context around groupedRoomsPackages:');
    console.log(js.substring(Math.max(0, idx - 400), Math.min(js.length, idx + 200)));
  }
}

findHookB().catch(console.error);
