import { spawn } from 'child_process';

async function traceNetwork() {
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

  console.log('Launched Chrome, waiting 3s for debug port...');
  await new Promise(r => setTimeout(r, 3000));

  try {
    const jsonRes = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await jsonRes.json();
    console.log('Targets found:', targets.length);
    const pageTarget = targets.find(t => t.type === 'page');
    if (!pageTarget) {
      console.error('No page target found');
      proc.kill();
      return;
    }

    const wsUrl = pageTarget.webSocketDebuggerUrl;
    console.log('Connecting to WebSocket:', wsUrl);

    const ws = new globalThis.WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('Connected to CDP WebSocket, enabling Network & Page...');
      ws.send(JSON.stringify({ id: 1, method: 'Network.enable' }));
      ws.send(JSON.stringify({ id: 2, method: 'Page.enable' }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Network.requestWillBeSent') {
        const url = msg.params.request?.url || '';
        if (url.includes('api') || url.includes('enigma') || url.includes('package') || url.includes('price')) {
          console.log(`[REQUEST] ${msg.params.request.method} ${url}`);
          if (msg.params.request.postData) {
            console.log(`[POST DATA]`, msg.params.request.postData);
          }
        }
      } else if (msg.method === 'Network.responseReceived') {
        const url = msg.params.response?.url || '';
        if (url.includes('api') || url.includes('enigma') || url.includes('package') || url.includes('price')) {
          console.log(`[RESPONSE ${msg.params.response.status}] ${url}`);
        }
      }
    };

    await new Promise(r => setTimeout(r, 15000));
    ws.close();
  } catch (err) {
    console.error('Trace error:', err);
  } finally {
    proc.kill();
    console.log('Finished CDP network trace');
  }
}

traceNetwork().catch(console.error);
