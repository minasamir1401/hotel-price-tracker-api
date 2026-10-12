import test from 'node:test';
import assert from 'node:assert/strict';
import {createAlmosaferHandoff} from '../scrapers/almosafer-handoff.js';
import {createAlmosaferFetch} from '../scrapers/almosafer-http.js';

const origin='https://www.almosafer.com',api=origin+'/api/enigma/v7/packages';
const options={method:'PUT',body:JSON.stringify({hotelId:'1287944',checkIn:'2026-10-20',checkOut:'2026-10-21',roomsInfo:[{adultsCount:2,kidsAges:[]}]}),headers:{token:'stale-token',Cookie:'stale-cookie',Referer:origin+'/ar/hotel/details/atg/hotel-1287944'}};
const complete={hotelId:'1287944',currencyCode:'SAR',numberOfNights:1,pollingStatus:'COMPLETED_SUCCESSFULLY',packagesGroups:[]};
function mockBrowser(){
  const requests=[];
  const browserFetch=async(url,request)=>{
    requests.push({url,request});
    if(!url.includes('/api/')){await new Promise(resolve=>setImmediate(resolve));return new Response('<script>public session page</script>');}
    return Response.json(url.includes('/poll/')?complete:{pId:'browser-price',hotelId:'1287944'});
  };
  browserFetch.exportSession=async()=>({origin,token:'guest-token',cookieHeader:'source-session=guest-cookie',userAgent:'Mozilla/5.0 Chrome/145.0.0.0'});
  browserFetch.close=async()=>{};
  return {browserFetch,requests};
}

test('A month shares one paid bootstrap and keeps all 60 price requests direct, with private session metadata',async()=>{
  const mock=mockBrowser();let calls=0;
  const handoff=createAlmosaferHandoff({...mock,directFetch:async(url,request)=>{
    calls++;assert.equal(new URL(url).origin,origin);
    assert.equal(request.headers.get('token'),'guest-token');assert.equal(request.headers.get('Cookie'),'source-session=guest-cookie');
    assert.ok(request.headers.get('User-Agent').includes('Chrome/145'));assert.equal(request.redirect,'error');
    return Response.json(url.includes('/poll/')?complete:{pId:'direct-price',hotelId:'1287944'});
  }});
  await Promise.all(Array.from({length:30},async()=>{
    assert.equal((await (await handoff(api,options)).json()).pId,'direct-price');
    assert.equal((await (await handoff(api+'/poll/direct-price')).json()).currencyCode,'SAR');
  }));
  assert.equal(mock.requests.length,1);assert.equal(calls,60);
  assert.equal(handoff.snapshot().bootstrapRequests,1);assert.equal(handoff.snapshot().browserApiRequests,0);
  assert.equal(handoff.snapshot().state,'direct');
  for(const secret of ['guest-token','guest-cookie','Chrome/145'])assert.ok(!JSON.stringify(handoff.snapshot()).includes(secret));
  await handoff(origin+'/ar/hotels-home');assert.equal(mock.requests.length,1);
});

test('Concurrent refusals trigger one direct probe per guest session, then honest browser fallback',async()=>{
  const mock=mockBrowser();let calls=0;
  const handoff=createAlmosaferHandoff({...mock,directFetch:async()=>{calls++;await new Promise(resolve=>setImmediate(resolve));return new Response('Cloudflare denied',{status:403});}});
  const results=await Promise.all(Array.from({length:30},()=>handoff(api,options)));
  assert.equal(calls,1);assert.ok(results.every(result=>result.ok));
  assert.equal(handoff.snapshot().state,'browser');assert.equal(handoff.snapshot().reason,'access-denied');
  assert.equal(handoff.snapshot().browserApiRequests,30);assert.equal(mock.requests.length,31);
});

test('Unverified direct JSON cannot become a sold-out result, and expired guest sessions bootstrap once again',async()=>{
  const mock=mockBrowser();let clock=0,calls=0;
  const handoff=createAlmosaferHandoff({...mock,now:()=>clock,ttlMs:100,directFetch:async()=>{calls++;return Response.json({pId:'no-pkg-invalid'});}});
  assert.equal((await (await handoff(api,options)).json()).pId,'browser-price');
  assert.equal(handoff.snapshot().reason,'invalid-response');
  await handoff(api,options);assert.equal(calls,1);
  clock=101;await handoff(api,options);assert.equal(calls,2);
  assert.equal(handoff.snapshot().bootstrapRequests,2);
});

test('Invalid payloads, wrong origins and aborts do not trigger paid price retries',async()=>{
  const mock=mockBrowser();
  const handoff=createAlmosaferHandoff({...mock,directFetch:async()=>new Response('Invalid request',{status:400})});
  assert.equal((await handoff(api,options)).status,400);assert.equal(handoff.snapshot().browserApiRequests,0);
  await assert.rejects(handoff('https://evil.example/api/enigma/v7/packages',options));
  await assert.rejects(handoff('https://private:password@www.almosafer.com/api/enigma/v7/packages',options));
  const controller=new AbortController();controller.abort();
  await assert.rejects(handoff(api,{...options,signal:controller.signal}));
  assert.equal(mock.requests.length,1);
});

test('Bright Data routing supports direct-after-bootstrap and an explicit browser-only override',async()=>{
  const env={ALMOSAFER_HTTP_TRANSPORT:'brightdata',ALMOSAFER_BROWSER_WS_ENDPOINT:'wss://test:password@brd.superproxy.io:9222'};
  for(const disabled of [false,true]){
    const mock=mockBrowser();let calls=0;
    const transport=createAlmosaferFetch({env:{...env,...(disabled?{ALMOSAFER_DIRECT_AFTER_BOOTSTRAP:'0'}:{})},createBrowser:()=>mock.browserFetch,nativeFetch:async()=>{calls++;return Response.json({pId:'native',hotelId:'1287944'});}});
    try{
      await transport(api,options);assert.equal(calls,disabled?0:1);
      assert.equal(transport.diagnostics().directAfterBootstrap,!disabled);
    }finally{await transport.close();}
  }
});
