const https = require('https');

function fetchJson(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function run() {
  const reqBody = {
    req: {
      checkInDate: '2026-10-01',
      checkOutDate: '2026-10-02',
      rooms: [{ adult: 2, children: [] }],
      hotelId: 133550,
      provider: '1'
    }
  };

  const options1 = {
    method: 'POST',
    headers: {
      'accept': 'application/json, text/plain, */*',
      'content-type': 'application/json;charset=UTF-8',
      'origin': 'https://almatar.com',
      'referer': 'https://almatar.com/',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'platform': 'Web',
      'domain': 'almatar.com'
    }
  };

  const data1 = await fetchJson('https://almatar.com/api/hotel/v4/rooms/getpackages/search_with_hotel', options1, reqBody);
  let sd = data1.data.sd;
  let executionTime = data1.data.executionTime;
  
  await new Promise(r => setTimeout(r, Math.min(4000, Math.max(1200, Number(executionTime) || 1800))));
  
  const options2 = {
    method: 'POST',
    headers: options1.headers
  };
  const body2 = {
    almHotelId: 133550,
    queueSessionId: sd,
    hotelProfileKey: 'mecca-al-marwa-rayhaan-by-rotana-makkah-133550',
    req: reqBody.req
  };
  const data2 = await fetchJson('https://almatar.com/api/hotel/v4/rooms/getpackages/search_with_session_id', options2, body2);
  
  for (const group of data2.data.searchRoomsResults) {
    if (!group.roomName.includes('توأم')) continue;
    const pkgs = [group.defaultPackage, ...(group.packages || [])].filter(Boolean);
    for (const pkg of pkgs) {
      if (pkg.rooms[0].roomBasis === 'BB' || pkg.rooms[0].roomBasis === 'HB') {
          console.log(`Room: ${group.roomName}, Plan: ${pkg.rooms[0].roomBasis}`);
          console.log(`finalPrice: ${pkg.finalPrice}, originalPrice: ${pkg.originalPrice}, sellingPrice: ${pkg.sellingPrice}, displayPrice: ${pkg.displayPrice}`);
          console.log(`totalPrice: ${pkg.totalPrice}, basePrice: ${pkg.basePrice}, taxAndFees: ${pkg.taxAndFees}`);
          console.log('---');
      }
    }
  }
}
run();
