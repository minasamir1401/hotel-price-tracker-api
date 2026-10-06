import http from 'http';
import https from 'https';

const hotelUrl = 'https://www.almosafer.com/ar/hotel/details/atg/hotel-62316?checkin=13-10-2026&checkout=14-10-2026&rooms=2_adult&ncr=1';

const standardHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
};

async function testUrl(label, url, headers) {
  console.log(`\n=== [TEST] ${label} ===`);
  console.log('Target URL:', url);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      redirect: 'manual',
    });

    console.log('Status:', res.status, res.statusText);
    console.log('Redirect Location:', res.headers.get('location') || 'none');
    console.log('Content-Type:', res.headers.get('content-type'));
    console.log('Server:', res.headers.get('server'));
    console.log('CF-Ray:', res.headers.get('cf-ray') || 'none');
    console.log('Set-Cookie Count:', res.headers.getSetCookie?.()?.length || (res.headers.get('set-cookie') ? 1 : 0));

    const text = await res.text();
    console.log('Body Length:', text.length);

    const isNextDataPresent = text.includes('__NEXT_DATA__');
    console.log('__NEXT_DATA__ found:', isNextDataPresent);

    if (isNextDataPresent) {
      const match = text.match(/<script\b(?=[^>]*\bid=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/i);
      try {
        const parsed = match && JSON.parse(match[1]);
        console.log('APIToken in __NEXT_DATA__:', parsed?.props?.pageProps?.APIToken || 'not found');
      } catch (e) {
        console.log('JSON parse error in __NEXT_DATA__');
      }
    } else {
      console.log('Body snippet (first 300 chars):');
      console.log(text.slice(0, 300).replace(/\s+/g, ' '));
    }
  } catch (err) {
    console.error('Fetch error:', err.message);
  }
}

async function testAutocomplete() {
  console.log(`\n=== [TEST] Autocomplete API ===`);
  const url = 'https://www.almosafer.com/api/enigma/autocomplete?query=kingsgate';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'token': '4R!eVj7$&7Q8Duhv1#pB',
    'x-authorization': '4R!eVj7$&7Q8Duhv1#pB',
    'x-api-key': 'apikey-hotel',
    'x-app-name': 'ct-web-hotels-app',
    'x-bt': 'next',
    'x-currency': 'SAR',
    'x-locale': 'ar',
  };
  try {
    const res = await fetch(url, { headers });
    console.log('Status:', res.status);
    if (res.ok) {
      const data = await res.json();
      console.log('Hotels returned:', data?.hotels?.length || 0);
    }
  } catch (err) {
    console.error('Autocomplete error:', err.message);
  }
}

async function testPackagesApi() {
  console.log(`\n=== [TEST] Enigma Packages API ===`);
  const url = 'https://www.almosafer.com/api/enigma/v7/packages';
  const headers = {
    'User-Agent': standardHeaders['User-Agent'],
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Origin': 'https://www.almosafer.com',
    'token': 'skdjfh73273$7268u2j89s',
    'x-api-key': 'apikey-hotel',
    'x-app-name': 'ct-web-hotels-app',
    'x-bt': 'next',
    'x-platform': 'web',
    'x-currency': 'SAR',
    'x-locale': 'ar',
  };
  const body = {
    hotelId: '62316',
    checkIn: '2026-10-13',
    checkOut: '2026-10-14',
    roomsInfo: [{ adultsCount: 2, kidsAges: [] }],
    currency: 'SAR',
  };
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });
    console.log('Status:', res.status, res.statusText);
    console.log('CF-Ray:', res.headers.get('cf-ray') || 'none');
    const data = await res.json().catch(() => null);
    console.log('pId returned:', data?.pId || 'none');
  } catch (err) {
    console.error('Packages API error:', err.message);
  }
}

async function run() {
  console.log('Node version:', process.version);
  console.log('Platform:', process.platform);

  // 1. Current minimal headers as used in almosafer-session.js
  await testUrl(
    'Almosafer Page (Current minimal headers)',
    hotelUrl,
    { 'User-Agent': standardHeaders['User-Agent'], Accept: 'text/html' }
  );

  // 2. Full browser headers
  await testUrl(
    'Almosafer Page (Full browser headers)',
    hotelUrl,
    standardHeaders
  );

  // 3. Autocomplete API
  await testAutocomplete();

  // 4. Enigma Packages API
  await testPackagesApi();
}

run();
