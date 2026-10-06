import { spawn } from 'child_process';

async function getPageText() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9222;
  
  const proc = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=C:\\Users\\Administrator\\Desktop\\New folder\\backend\\chrome_profile_tmp',
    'https://www.almosafer.com/ar/hotel/details/atg/%D9%81%D9%86%D8%AF%D9%82-%D9%83%D9%8A%D9%86%D8%AC%D8%B2%D8%AC%D9%8A%D8%AA-%D8%AF%D9%8A%D8%A7%D8%B1-1287944?checkin=01-10-2026&checkout=02-10-2026&rooms=2_adult&priceMode=total'
  ]);

  await new Promise(r => setTimeout(r, 4000));

  try {
    const jsonRes = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await jsonRes.json();
    const pageTarget = targets.find(t => t.type === 'page');
    const ws = new globalThis.WebSocket(pageTarget.webSocketDebuggerUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === 50) {
        console.log('EVAL RESULT:', msg.result?.result?.value);
      }
    };

    await new Promise(r => setTimeout(r, 5000));
    // Scroll down
    ws.send(JSON.stringify({ id: 10, method: 'Runtime.evaluate', params: { expression: 'window.scrollTo(0, 1200);' } }));
    await new Promise(r => setTimeout(r, 4000));

    // Get text
    ws.send(JSON.stringify({
      id: 50,
      method: 'Runtime.evaluate',
      params: {
        expression: `(() => {
          return {
            title: document.title,
            url: window.location.href,
            rooms: Array.from(document.querySelectorAll('[data-testid*="room"], [class*="RoomCard"], [class*="room-card"], [class*="Room"]')).map(el => el.innerText.substring(0, 100)),
            has397: document.body.innerText.includes('397'),
            has524: document.body.innerText.includes('524'),
            hasStandard: document.body.innerText.includes('ستاندرد'),
            textSnippet: document.body.innerText.substring(0, 2000)
          };
        })()`,
        returnByValue: true
      }
    }));

    await new Promise(r => setTimeout(r, 4000));
    ws.close();
  } catch (err) {
    console.error('Error:', err);
  } finally {
    proc.kill();
  }
}

getPageText().catch(console.error);
