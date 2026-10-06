async function test() {
  const apiToken = '4R!eVj7$&7Q8Duhv1#pB';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'token': apiToken,
    'x-authorization': apiToken,
    'x-api-key': 'apikey-hotel',
    'x-app-name': 'ct-web-hotels-app',
    'x-bt': 'next',
    'x-currency': 'SAR',
    'x-locale': 'ar',
  };

  // Search hotels API
  const lookupRes = await fetch('https://www.almosafer.com/api/enigma/v1/hotels/lookup?query=' + encodeURIComponent('كينجزجيت ديار'), { headers });
  console.log('Lookup status:', lookupRes.status);
  if (lookupRes.status === 200) {
    const lookupData = await lookupRes.json();
    console.log('Lookup result:', JSON.stringify(lookupData, null, 2));
  } else {
    console.log('Lookup text:', await lookupRes.text());
  }
}
test().catch(console.error);
