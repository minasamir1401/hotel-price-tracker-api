import { spawn } from 'child_process';

async function traceNetworkWithScroll() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9222;
  
  const proc = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=C:\\Users\\Administrator\\Desktop\\New folder\\backend\\chrome_profile_tmp',
    'https://www.almosafer.com/ar/hotel/details/atg/%D9%81%D9%86%D8%AF%D9%83-%D9%83%D9%8A%D9%86%D8%AC%D8%B2%D8%AC%D9%8A%D8%AA-%D8%AF%D9%8A%D8%A7%D8%B1-1287944?checkin=01-10-2026&checkout=02-10-2026&rooms=2_adult&priceMode=total'
  ]);

  await new Promise(r => setTimeout(r, 3000));

  try {
    const jsonRes = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await jsonRes.json();
    const pageTarget = targets.find(t => t.type === 'page');
    const ws = new globalThis.WebSocket(pageTarget.webSocketDebuggerUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({ id: 1, method: 'Network.enable' }));
      ws.send(JSON.stringify({ id: 2, method: 'Runtime.enable' }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Network.requestWillBeSent') {
        const url = msg.params.request?.url || '';
        if (url.includes('enigma') || url.includes('packages') || url.includes('rooms')) {
          console.log(`[REQUEST] ${msg.params.request.method} ${url}`);
          if (msg.params.request.postData) {
            console.log(`[POST DATA]`, msg.params.request.postData);
          }
        }
      } else if (msg.method === 'Network.responseReceived') {
        const url = msg.params.response?.url || '';
        if (url.includes('enigma') || url.includes('packages') || url.includes('rooms')) {
          console.log(`[RESPONSE ${msg.params.response.status}] ${url}`);
        }
      }
    };

    // Wait 5s, then scroll down multiple times
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 2000));
      ws.send(JSON.stringify({
        id: 10 + i,
        method: 'Runtime.evaluate',
        params: { expression: 'window.scrollBy(0, 800);' }
      }));
    }

    // Now extract all text content from the rooms section
    await new Promise(r => setTimeout(r, 3000));
    ws.send(JSON.stringify({
      id: 99,
      method: 'Runtime.evaluate',
      params: {
        expression: `(() => {
          const body = document.body.innerText;
          return {
            hasStandard: body.includes('ستاندرد'),
            has397: body.includes('397'),
            has524: body.includes('524'),
            bodySnippet: body.substring(0, 3000)
          };
        })()`,
        returnByValue: true
      }
    }));

    await new Promise(r => setTimeout(r, 5000));
    ws.close();
  } catch (err) {
    console.error('Error:', err);
  } finally {
    proc.kill();
  }
}

traceNetworkWithScroll().catch(console.error);
