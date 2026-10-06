import fs from 'fs';

const html = fs.readFileSync('backend/almosafer_page.html', 'utf8');

function showContext(target) {
  let idx = 0;
  console.log(`=== Target: ${target} ===`);
  while ((idx = html.indexOf(target, idx)) !== -1) {
    console.log(html.substring(Math.max(0, idx - 150), Math.min(html.length, idx + 250)));
    console.log('---');
    idx += target.length + 10;
  }
}

showContext('217');
