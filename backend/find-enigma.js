import fs from 'fs';

const html = fs.readFileSync('backend/almosafer_page.html', 'utf8');

const enigmaIndex = html.indexOf('"enigma"');
if (enigmaIndex !== -1) {
  console.log(html.substring(enigmaIndex, enigmaIndex + 600));
}
