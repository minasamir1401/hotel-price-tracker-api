import fs from 'fs';

const html = fs.readFileSync('backend/almosafer_page.html', 'utf8');

function findSnippets(text, word, count = 5) {
  let pos = 0;
  let found = 0;
  while ((pos = text.indexOf(word, pos)) !== -1 && found < count) {
    const start = Math.max(0, pos - 200);
    const end = Math.min(text.length, pos + 200);
    console.log(`\n=== Snippet for "${word}" at ${pos} ===`);
    console.log(text.substring(start, end));
    pos += word.length;
    found++;
  }
}

findSnippets(html, 'كلاسيك', 5);
findSnippets(html, '203', 5);
