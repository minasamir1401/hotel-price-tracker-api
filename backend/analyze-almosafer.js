import fs from 'fs';

const html = fs.readFileSync('backend/almosafer_page.html', 'utf8');
console.log('Includes ستاندرد:', html.includes('ستاندرد'));
console.log('Includes كلاسيك:', html.includes('كلاسيك'));
console.log('Includes 203:', html.includes('203'));
console.log('Includes 271:', html.includes('271'));
console.log('Includes 495:', html.includes('495'));
console.log('Includes 1798852:', html.includes('1798852'));

// Check Almosafer API calls or endpoints mentioned
const regex = /api[a-zA-Z0-9_\-\.\/]+/g;
const matches = html.match(regex) || [];
console.log('API matches count:', matches.length);
console.log('Unique sample:', Array.from(new Set(matches)).slice(0, 20));

// Check next_data
if (fs.existsSync('backend/almosafer_next_data.json')) {
  const json = JSON.parse(fs.readFileSync('backend/almosafer_next_data.json', 'utf8'));
  console.log('APIToken:', json.props?.pageProps?.APIToken);
  console.log('query:', json.props?.pageProps?.query);
}
