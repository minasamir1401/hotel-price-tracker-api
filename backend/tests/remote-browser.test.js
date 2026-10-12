import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {almosaferConnection} from '../scrapers/almosafer-connection.js';
import {createAlmosaferBrowserFetch} from '../scrapers/almosafer-browser-http.js';
import {createLiveScraper} from '../scrapers/almosafer-live.js';
import {UpstreamError} from '../scrapers/upstream-error.js';
import {almosaferInputOrigin} from '../scrapers/almosafer-origin.js';
import {createAlmosaferClient} from '../scrapers/almosafer.js';
import {createEnigmaClient} from '../scrapers/enigma.js';

const endpoint='wss://test-user:test-password@remote.example:9222';
const env={ALMOSAFER_HTTP_TRANSPORT:'browser',ALMOSAFER_BROWSER_WS_ENDPOINT:endpoint};
const origin='https://global.almosafer.com';

test('Remote browser configuration accepts authenticated WebSocket endpoint and keeps failures private',()=>{
  const config=almosaferConnection(env);
  assert.equal(config.transport,'browser');assert.equal(config.remote,true);assert.equal(config.proxy,undefined);
  assert.equal(config.concurrency,2);assert.equal(config.browserFallback,false);
  assert.equal(almosaferConnection({ALMOSAFER_BROWSER_WS_ENDPOINT:endpoint}).remote,true);
  assert.equal(almosaferInputOrigin(origin+'/ar/hotels',{...env,ALMOSAFER_BROWSER_ORIGIN:'https://www.almosafer.com'}),'https://www.almosafer.com');
  assert.equal(almosaferInputOrigin(origin+'/ar/hotels',{}),origin);
  assert.throws(()=>almosaferInputOrigin(origin+'/ar/hotels',{...env,ALMOSAFER_BROWSER_ORIGIN:'https://evil.example'}));
  for(const url of [endpoint.replace('wss:','https:'),endpoint+'?secret=test-password',endpoint+'#hash','invalid-test-password'])
    assert.throws(()=>almosaferConnection({...env,ALMOSAFER_BROWSER_WS_ENDPOINT:url}),error=>!error.message.includes('test-password'));
});

function remoteMock(redirectOrigin=origin){
  let connections=0,navigations=0,closed=0;
  const requests=[],routes=[];
  const page=new EventEmitter();
  page.goto=async url=>{navigations++;const target=new URL(url);page.href=new URL(target.pathname+target.search,redirectOrigin).href;await new Promise(resolve=>setImmediate(resolve));return {status:()=>200,allHeaders:async()=>({'content-type':'text/html'})};};
  page.url=()=>page.href;
  page.waitForFunction=async()=>{};
  page.content=async()=>'<script id="__NEXT_DATA__">{"props":{"pageProps":{"APIToken":"source-token"}}}</script>';
  page.close=async()=>{};
  page.route=async(_pattern,callback)=>{routes.push(callback);};
  page.evaluate=async(_fn,input)=>{requests.push(input);return {status:200,headers:{'content-type':'application/json'},body:'{"available":true}'};};
  const context={newPage:async()=>page,cookies:async()=>[{name:'source-session',value:'same-browser-cookie',path:'/'}]};
  const browser={contexts:()=>[context],newContext:()=>{throw new Error('Must retain provider context');},isConnected:()=>true,close:async()=>{closed++;}};
  return {requests,routes,counts:()=>({connections,navigations,closed}),connect:async url=>{assert.equal(url,endpoint);connections++;return browser;}};
}

test('Concurrent bootstrap and 30 daily requests share one remote browser and navigation with independent response bodies',async()=>{
  const mock=remoteMock();
  const transport=createAlmosaferBrowserFetch({...mock,env,launch:()=>{throw new Error('Local browser must not launch');}});
  try{
    const documents=await Promise.all([transport(origin+'/ar/hotel/details/atg/hotel-1287944'),transport(origin+'/ar/hotels-home')]);
    assert.equal(await documents[0].text(),await documents[1].text());
    await transport(origin+'/ar/hotels-home');
    for(let day=0;day<30;day++)await transport(origin+'/api/enigma/v7/packages',{method:'PUT',headers:{token:'stale',Cookie:'not-exported'},body:JSON.stringify({day})});
    assert.equal(mock.counts().connections,1);assert.equal(mock.counts().navigations,1);
    assert.equal(mock.requests.length,30);
    assert.ok(mock.requests.every(request=>request.headers.token==='source-token'&&!request.headers.cookie));
    let aborted=0,continued=0;
    for(const [type,host] of [['image','hotel-images.example'],['font','fonts.example'],['media','video.example'],['script','global.almosafer.com'],['image','challenges.cloudflare.com']])
      await mock.routes[0]({request:()=>({resourceType:()=>type,url:()=>`https://${host}/resource`}),abort:async()=>{aborted++;},continue:async()=>{continued++;}});
    assert.equal(aborted,3);assert.equal(continued,2);
  }finally{await transport.close();}
  assert.equal(mock.counts().closed,1);
});

test('A first-party redirect retains its cookies and API origin while unrelated redirects are rejected',async()=>{
  const mock=remoteMock('https://www.almosafer.com');
  const transport=createAlmosaferBrowserFetch({...mock,env});
  try{
    await transport(origin+'/ar/hotels-home');
    await transport(origin+'/api/enigma/v7/packages');
    assert.equal(new URL(mock.requests[0].url).origin,'https://www.almosafer.com');
  }finally{await transport.close();}
  const unrelated=createAlmosaferBrowserFetch({...remoteMock('https://evil.example'),env});
  try{await assert.rejects(unrelated(origin+'/ar/hotels-home'));}
  finally{await unrelated.close();}
});

test('Cached web tokens do not shorten remote browser startup to a 20-second API deadline',async()=>{
  const oldEndpoint=process.env.ALMOSAFER_BROWSER_WS_ENDPOINT,oldTransport=process.env.ALMOSAFER_HTTP_TRANSPORT;
  const originalTimeout=AbortSignal.timeout,timeouts=[];
  process.env.ALMOSAFER_HTTP_TRANSPORT='browser';process.env.ALMOSAFER_BROWSER_WS_ENDPOINT=endpoint;
  AbortSignal.timeout=ms=>{timeouts.push(ms);return new AbortController().signal;};
  try{
    const client=createEnigmaClient({token:'cached-public-token',sleep:async()=>{},fetchImpl:async url=>new Response(JSON.stringify(url.includes('/poll/')?
      {hotelId:'1287944',currencyCode:'SAR',numberOfNights:1,pollingStatus:'COMPLETED_SUCCESSFULLY',packagesGroups:[]}:
      {pId:'valid',hotelId:'1287944'}))});
    await client({hotelId:'1287944',roomsInfo:[{adultsCount:2,kidsAges:[]}]},{maxAttempts:1});
    assert.equal(timeouts.length,2);assert.ok(timeouts.every(ms=>ms>120000&&ms<=150000));
  }finally{
    AbortSignal.timeout=originalTimeout;
    for(const [key,value] of [['ALMOSAFER_BROWSER_WS_ENDPOINT',oldEndpoint],['ALMOSAFER_HTTP_TRANSPORT',oldTransport]])if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});

test('407 diagnostics conceal credentials and a failed month stops after the initial bounded batch',async()=>{
  const transport=createAlmosaferBrowserFetch({env,connect:async()=>{throw new Error(`WebSocket error ${endpoint} 407 Auth Failed (wrong_password)`);}});
  try{await assert.rejects(transport(origin+'/ar/hotels-home'),error=>error.code==='BROWSER_AUTH_FAILED'&&!error.message.includes('test-password'));}
  finally{await transport.close();}
  const previous=process.env.ALMOSAFER_BROWSER_WS_ENDPOINT;
  process.env.ALMOSAFER_BROWSER_WS_ENDPOINT=endpoint;
  try{
    let calls=0;
    const scrape=createLiveScraper(async()=>({hotelId:'1287944'}),async()=>{calls++;throw new UpstreamError('Auth failed',{stage:'browser-connect',source:'almosafer',code:'BROWSER_AUTH_FAILED'});});
    await assert.rejects(scrape({hotelInput:'hotel',checkIn:'2026-10-20',checkOut:'2026-11-19'}),error=>error.code==='BROWSER_AUTH_FAILED');
    assert.equal(calls,2);
    let blockedCalls=0;
    const blocked=createLiveScraper(async()=>({hotelId:'1287944'}),async()=>{
      blockedCalls++;
      throw Object.assign(new UpstreamError('Cloudflare refused',{stage:'session-bootstrap',source:'almosafer',status:403}),{responseKind:'access-denied'});
    });
    await assert.rejects(blocked({hotelInput:'hotel',checkIn:'2026-10-20',checkOut:'2026-11-19'}),/Cloudflare/);
    assert.equal(blockedCalls,2);
    let emptyCalls=0;
    const empty=createLiveScraper(async()=>({hotelId:'1287944'}),async()=>{emptyCalls++;return {};});
    assert.equal((await empty({hotelInput:'hotel',checkIn:'2026-10-20',checkOut:'2026-11-19'})).length,0);
    assert.equal(emptyCalls,30);
  }finally{if(previous===undefined)delete process.env.ALMOSAFER_BROWSER_WS_ENDPOINT;else process.env.ALMOSAFER_BROWSER_WS_ENDPOINT=previous;}
});

test('A failed month night gets one isolated repair session without replacing the shared browser',async()=>{
  let transports=0,closed=0,ordinaryClients=0;
  const client=createAlmosaferClient({env,createFetch:()=>{transports++;return {close:async()=>{closed++;}};},createClient:({origin:host,fetchImpl})=>{
    assert.equal(host,origin);if(!fetchImpl)ordinaryClients++;
    return async(payload)=>({hotelId:payload.hotelId,fresh:Boolean(fetchImpl)});
  }});
  const payload={sourceOrigin:origin,hotelId:'1287944'};
  assert.equal((await client(payload)).fresh,false);
  assert.equal((await client(payload,{freshSession:true})).fresh,true);
  assert.equal((await client(payload)).fresh,false);
  assert.equal(ordinaryClients,1);assert.equal(transports,1);assert.equal(closed,1);
  const previous=process.env.ALMOSAFER_BROWSER_WS_ENDPOINT;
  process.env.ALMOSAFER_BROWSER_WS_ENDPOINT=endpoint;
  try{
    let calls=0;
    const scrape=createLiveScraper(async()=>({hotelId:'1287944'}),async(_payload,options)=>{
      calls++;if(calls===1)throw new Error('Invalid source query');
      assert.equal(options.freshSession,true);return {};
    });
    await scrape({hotelInput:'hotel',checkIn:'2026-11-15',checkOut:'2026-11-16'});
    assert.equal(calls,2);
  }finally{if(previous===undefined)delete process.env.ALMOSAFER_BROWSER_WS_ENDPOINT;else process.env.ALMOSAFER_BROWSER_WS_ENDPOINT=previous;}
});

test('ScrapingAnt missing nights get isolated sessions and bounded retries while successful nights retain their own quotes', async () => {
  let ordinaryClients = 0, isolatedClients = 0, closed = 0, repairs = 0;
  const client = createAlmosaferClient({ env: { ALMOSAFER_HTTP_TRANSPORT: 'scrapingant' },
    createFetch: () => ({ close: async () => { closed++; } }),
    createClient: ({ fetchImpl }) => {
      if (fetchImpl) isolatedClients++; else ordinaryClients++;
      return async (input, options) => {
        const missing = input.checkIn === '2027-02-27';
        if (!fetchImpl && missing) throw new Error('Unverified source response');
        if (fetchImpl) {
          repairs++;
          assert.equal(options.maxAttempts, 2);
          assert.equal(options.refresh, true);
        }
        return { twin: { name: 'Twin', beds: [], offers: { breakfast: { price: missing ? 234.56 : 123.45, packageId: input.checkIn } } } };
      };
    },
  });
  const scrape = createLiveScraper(async () => ({ hotelId: '1441222', baseSlug: 'hotel/details/atg/hotel-1441222' }), client);
  const [room] = await scrape({ hotelInput: 'hotel', checkIn: '2027-02-26', checkOut: '2027-02-28' });
  assert.deepEqual(room.dailyRates.map(day => day.breakfastPrice), [123.45, 234.56]);
  assert.deepEqual(room.dailyRates.map(day => day.offers.breakfast.packageId), ['2027-02-26', '2027-02-27']);
  assert.deepEqual(room.warnings, []);
  assert.equal(ordinaryClients, 1);
  assert.equal(isolatedClients, 1);
  assert.equal(closed, 1);
  assert.equal(repairs, 1);
});
