import { spawn } from 'child_process';
import fs from 'fs';

async function traceLive() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9333;
  const profileDir = 'C:\\Users\\Administrator\\Desktop\\New folder\\backend\\chrome_profile_tmp2';

  const targetUrl = 'https://www.almosafer.com/ar/hotel/details/atg/%D9%81%D9%86%D8%AF%D9%82-%D9%83%D9%8A%D9%86%D8%AC%D8%B2%D8%AC%D9%8A%D8%AA-%D8%AF%D9%8A%D8%A7%D8%B1-1287944?checkin=20-10-2026&checkout=21-10-2026&rooms=3_adult&ncr=1';

  const proc = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--user-data-dir=${profileDir}`,
    targetUrl
  ]);

  console.log('Launched Chrome, waiting for debug port...');
  await new Promise(r => setTimeout(r, 4000));

  try {
    const jsonRes = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await jsonRes.json();
    const pageTarget = targets.find(t => t.type === 'page');
    if (!pageTarget) {
      console.error('No page target found');
      proc.kill();
      return;
    }

    const wsUrl = pageTarget.webSocketDebuggerUrl;
    console.log('Connecting to WebSocket:', wsUrl);
    const ws = new globalThis.WebSocket(wsUrl);

    let msgId = 1;
    const send = (method, params = {}) => {
      const id = msgId++;
      ws.send(JSON.stringify({ id, method, params }));
      return id;
    };

    const responses = [];

    ws.onopen = () => {
      console.log('Enabling Network and Runtime...');
      send('Network.enable');
      send('Runtime.enable');
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.method === 'Network.requestWillBeSent') {
          const req = msg.params.request;
          if (req.url.includes('packages') || req.url.includes('campaign') || req.url.includes('calendar')) {
            console.log(`[REQ] ${req.method} ${req.url}`);
            console.log('Headers:', JSON.stringify(req.headers));
            if (req.postData) console.log('[POST]', req.postData);
          }
        } else if (msg.method === 'Network.responseReceived') {
          const res = msg.params.response;
          if (res.url.includes('packages') || res.url.includes('campaign') || res.url.includes('calendar')) {
            console.log(`[RES ${res.status}] ${res.url}`);
            const reqId = send('Network.getResponseBody', { requestId: msg.params.requestId });
            responses.push({ reqId, url: res.url });
          }
        } else if (msg.id && responses.some(r => r.reqId === msg.id)) {
          const item = responses.find(r => r.reqId === msg.id);
          if (msg.result?.body) {
            console.log(`[BODY for ${item.url.slice(0, 50)}] length:`, msg.result.body.length);
            const fname = `browser_resp_${Date.now()}_${item.reqId}.json`;
            fs.writeFileSync(fname, msg.result.body);
            console.log('Saved to', fname);
          }
        } else if (msg.result?.result?.value) {
          console.log('DOM Evaluation Result:', JSON.stringify(msg.result.result.value, null, 2));
        }
      } catch (e) {
        console.error('Error handling message:', e);
      }
    };

    console.log('Waiting 35 seconds for page to load and poll...');
    await new Promise(r => setTimeout(r, 35000));

    send('Runtime.evaluate', {
      expression: `(() => {
        const text = document.body.innerText;
        return {
          length: text.length,
          has808: text.includes('808'),
          has936: text.includes('936'),
          has1107: text.includes('1107') || text.includes('1,107'),
          rooms: Array.from(document.querySelectorAll('h3, h4, [class*="RoomCard"], [class*="room-card"]')).map(e => e.innerText)
        };
      })()`,
      returnByValue: true
    });

    await new Promise(r => setTimeout(r, 5000));
    ws.close();
  } catch (err) {
    console.error('Error during trace:', err);
  } finally {
    proc.kill();
    console.log('Chrome closed.');
  }
}

traceLive();
