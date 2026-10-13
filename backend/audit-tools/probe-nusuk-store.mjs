// Read the official Huawei listing in a fresh browser; do not install Android code.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve('outputs/nusuk-app-probe/huawei-browser');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chromium' });
const context = await browser.newContext({ locale: 'en-US' });
const page = await context.newPage();
context.on('page', newPage => {
  newPage.on('download', async download => {
    await fs.writeFile(path.join(out, 'download-url-private.txt'), download.url());
    console.log(JSON.stringify({stage:'popup-download', host:new URL(download.url()).hostname}));
  });
});
const pending = [];
let index = 0;
page.on('response', response => {
  if (!response.url().includes('hispace.dbankcloud.com/edge/')) return;
  const number = ++index;
  pending.push((async () => {
    const body = await response.body().catch(() => Buffer.from(''));
    await fs.writeFile(path.join(out, `response-${number}.json`), body);
    console.log(JSON.stringify({number, path: new URL(response.url()).pathname,
      status: response.status(), bytes: body.length}));
  })());
});
try {
  await page.goto('https://appgallery.huawei.com/app/C109925603', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => document.body.innerText.includes('Nusuk') || document.body.innerText.includes('No result'), { timeout: 20000 }).catch(() => {});
  const body = await page.locator('body').innerText();
  await fs.writeFile(path.join(out, 'page.txt'), body);
  const downloadLink = page.getByText('Download app', {exact:true});
  if (await downloadLink.count()) {
    await fs.writeFile(path.join(out, 'download-control.json'), JSON.stringify(await downloadLink.first().evaluate(el => ({tag:el.tagName, href:el.getAttribute('href'), outer:el.outerHTML})), null, 2));
    page.on('download', async download => {
      console.log(JSON.stringify({stage:'download-start', file:download.suggestedFilename(), host:new URL(download.url()).hostname}));
      await fs.writeFile(path.join(out, 'download-url-private.txt'), download.url());
    });
    await downloadLink.first().click({timeout:10000});
    await page.waitForTimeout(8000);
    await fs.writeFile(path.join(out, 'open-pages.json'), JSON.stringify(context.pages().map(p => p.url()), null, 2));
    await fs.writeFile(path.join(out, 'after-download-click.txt'), await page.locator('body').innerText());
  }
  await page.screenshot({path: path.join(out, 'page.png'), fullPage: true});
  console.log(JSON.stringify({stage:'listing', foundNusuk: /Nusuk|نسك/i.test(body), characters: body.length}));
  await Promise.allSettled(pending);
} finally {
  await browser.close();
}
