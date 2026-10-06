async function inspectGetPackages() {
  const res = await fetch('https://cdn.almatar.com/web/main.be78c506773c81ae.js');
  const text = await res.text();
  const idx = text.indexOf('/api/hotel/v3/rooms/getpackages');
  if (idx !== -1) {
    console.log('Context getpackages:', text.slice(Math.max(0, idx - 200), idx + 300));
  }
  const idx2 = text.indexOf('/api/hotel/v3/rooms/search_with_hotel/getpackages');
  if (idx2 !== -1) {
    console.log('Context search_with_hotel:', text.slice(Math.max(0, idx2 - 200), idx2 + 300));
  }
}

inspectGetPackages();





