async function testFullApiSearch() {
  const reqBody = {
    hotelInput: 'فندق ميلينيوم النسيم مكة',
    checkIn: '2026-09-29',
    checkOut: '2026-10-11',
    adults: 2,
    children: 0,
    rooms: 1,
    sources: ['almosafer', 'almatar']
  };

  console.log('Sending search request to backend...');
  const res = await fetch('http://localhost:5000/api/search-hotel-prices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reqBody)
  });

  const data = await res.json();
  console.log('Success:', data.success);
  console.log('Rooms count:', data.data?.length);

  const breakdown = data.summary?.dailyBreakdown || [];
  console.log('Daily breakdown nights count:', breakdown.length);

  console.log('\nSample breakdown days:');
  breakdown.forEach((d) => {
    console.log(
      `${d.date} (${d.dayOfWeek}): Almosafer [RO: ${d.almosaferRoomOnly}, BB: ${d.almosaferBreakfast}, HB: ${d.almosaferHalfBoard}] | Almatar [RO: ${d.almatarRoomOnly}, BB: ${d.almatarBreakfast}, HB: ${d.almatarHalfBoard}]`
    );
  });
}

testFullApiSearch();
