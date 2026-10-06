async function run() {
  const url = 'https://www.almosafer.com/assets/hotel/desktop/_next/static/chunks/pages/%5Blang%5D/hotel/details/atg/%5B...hotelDetails%5D-cad91eb53016e496.js';
  const res = await fetch(url);
  const text = await res.text();
  console.log('Script length:', text.length);

  // Search for packageRateInfo or total or finalPrice or discount or crossOutPrice or lowest
  const matches = [...text.matchAll(/(?:packageRateInfo|crossOutPrice|discount|finalPrice|campaign|coupon|loyalty|vat)/gi)].map(m => m[0]);
  console.log('Keyword occurrences:', matches.reduce((acc, k) => { acc[k] = (acc[k] || 0) + 1; return acc; }, {}));

  // Find occurrences of packageRateInfo
  let idx = 0;
  while ((idx = text.indexOf('packageRateInfo', idx + 1)) !== -1) {
    console.log('Context around packageRateInfo:', text.slice(Math.max(0, idx - 100), idx + 200));
    break;
  }
}
run();
