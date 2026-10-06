async function run() {
  const checkIn = '2026-10-01';
  const checkOut = '2026-10-02';
  
  const reqBody = {
    req: {
      checkInDate: checkIn,
      checkOutDate: checkOut,
      rooms: [{ adult: 2, children: [] }],
      hotelId: 133550,
      provider: '1'
    }
  };

  const r1 = await fetch('https://almatar.com/api/hotel/v4/rooms/getpackages/search_with_hotel', {
    method: 'POST',
    headers: {
      'accept': 'application/json, text/plain, */*',
      'content-type': 'application/json;charset=UTF-8',
      'origin': 'https://almatar.com',
      'referer': 'https://almatar.com/',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'platform': 'Web',
      'domain': 'almatar.com'
    },
    body: JSON.stringify(reqBody)
  });
  
  const data1 = await r1.json();
  let sd = data1.data.sd;
  let executionTime = data1.data.executionTime;
  
  await new Promise(r => setTimeout(r, Math.min(4000, Math.max(1200, Number(executionTime) || 1800))));
  
  const r2 = await fetch('https://almatar.com/api/hotel/v4/rooms/getpackages/search_with_session_id', {
    method: 'POST',
    headers: {
      'accept': 'application/json, text/plain, */*',
      'content-type': 'application/json;charset=UTF-8',
      'origin': 'https://almatar.com',
      'referer': 'https://almatar.com/',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'platform': 'Web',
      'domain': 'almatar.com'
    },
    body: JSON.stringify({
      almHotelId: 133550,
      queueSessionId: sd,
      hotelProfileKey: 'mecca-al-marwa-rayhaan-by-rotana-makkah-133550',
      req: reqBody.req
    })
  });
  
  const data2 = await r2.json();
  for (const group of data2.data.searchRoomsResults) {
    if (!group.roomName.includes('توأم')) continue;
    const pkgs = [group.defaultPackage, ...(group.packages || [])].filter(Boolean);
    for (const pkg of pkgs) {
      console.log(`Room: ${group.roomName}, Plan: ${pkg.rooms[0].roomBasis}`);
      console.log(`finalPrice: ${pkg.finalPrice}, originalPrice: ${pkg.originalPrice}, sellingPrice: ${pkg.sellingPrice}, displayPrice: ${pkg.displayPrice}`);
      console.log(`totalPrice: ${pkg.totalPrice}, basePrice: ${pkg.basePrice}, taxAndFees: ${pkg.taxAndFees}`);
      console.log('---');
    }
  }
}
run();
