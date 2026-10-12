import {almosaferOrigin} from './almosafer-origin.js';
import {isChallengeResponse} from './challenge-response.js';

// Browser session bootstraps the guest session; price traffic first tries the direct
// HTTP connection. A refusal disables that path for the lifetime of the session.
// No browser cookies, tokens, endpoint credentials or response bodies are logged.
export function createAlmosaferHandoff({browserFetch,directFetch=fetch,directTransport='native',now=Date.now,ttlMs=300000}={}) {
  const states=new Map(),pending=new Map();
  const counters={bootstrapRequests:0,directRequests:0,browserApiRequests:0};
  let last={state:'unchecked',reason:null,lastDirectSuccessAt:null};

  async function capture(origin,response) {
    if(!response.ok || await isChallengeResponse(response))return null;
    const session=await browserFetch.exportSession(origin);
    if(!session?.token || !session.userAgent)return null;
    almosaferOrigin(session.origin);
    const entry={...session,documentResponse:response.clone(),expires:now()+ttlMs,blocked:false,probing:null,unchecked:true};
    states.set(origin,entry);
    return entry;
  }

  async function bootstrap(origin,url,options) {
    if(pending.has(origin))return (await pending.get(origin)).clone();
    const work=(async()=>{
      counters.bootstrapRequests++;
      const response=await browserFetch(url,options);
      await capture(origin,response);
      return response;
    })().finally(()=>pending.delete(origin));
    pending.set(origin,work);
    return (await work).clone();
  }

  function documentTarget(parsed,options) {
    const referer=new Headers(options.headers).get('referer');
    let url=new URL('/ar/hotels-home',parsed.origin);
    if(referer && new URL(referer).origin===parsed.origin)url=new URL(referer);
    let payload;
    try{payload=JSON.parse(options.body || '{}');}catch{}
    if(payload?.checkIn)url.searchParams.set('checkin',payload.checkIn.split('-').reverse().join('-'));
    if(payload?.checkOut)url.searchParams.set('checkout',payload.checkOut.split('-').reverse().join('-'));
    if(payload?.roomsInfo)url.searchParams.set('rooms',payload.roomsInfo.map(room=>room.kidsAges?.length?
      `${room.adultsCount}_adult,${room.kidsAges.length}_child,${room.kidsAges.join('-')}_age`:`${room.adultsCount}_adult`).join('*'));
    url.searchParams.set('ncr','1');
    return url.href;
  }

  async function validResponse(response,parsed,options) {
    if(!response.ok || await isChallengeResponse(response))return {ok:false,reason:[401,403,429].includes(response.status)?'access-denied':'http-error'};
    const text=await response.clone().text();
    if(Buffer.byteLength(text)>8*1024*1024)return {ok:false,reason:'invalid-response'};
    let data;try{data=JSON.parse(text);}catch{return {ok:false,reason:'invalid-response'};}
    if(parsed.pathname.endsWith('/packages')) {
      let payload;try{payload=JSON.parse(options.body);}catch{}
      const ok=typeof data.pId==='string' && !data.pId.startsWith('no-pkg') && String(data.hotelId)===String(payload?.hotelId);
      return {ok,reason:ok?null:'invalid-response'};
    }
    const complete=data.pollingStatus==='COMPLETED_SUCCESSFULLY';
    const ok=data.pollingStatus==='IN_PROGRESS' || (complete && Boolean(data.hotelId) && data.currencyCode==='SAR' && data.numberOfNights===1 && Array.isArray(data.packagesGroups));
    return {ok,complete:ok&&complete,reason:ok?null:'invalid-response'};
  }

  async function direct(parsed,options,entry) {
    counters.directRequests++;
    const headers=new Headers(options.headers);
    headers.set('token',entry.token);headers.set('Cookie',entry.cookieHeader);headers.set('User-Agent',entry.userAgent);
    headers.set('Origin',entry.origin);
    const referer=headers.get('referer');
    if(referer) {
      const ref=new URL(referer);headers.set('Referer',new URL(ref.pathname+ref.search,entry.origin).href);
    }
    const version=entry.userAgent.match(/Chrome\/(\d+)/)?.[1];
    if(version)headers.set('sec-ch-ua',`"Google Chrome";v="${version}", "Chromium";v="${version}", "Not_A Brand";v="24"`);
    const platform=/Windows/.test(entry.userAgent)?'Windows':/Macintosh/.test(entry.userAgent)?'macOS':/Android/.test(entry.userAgent)?'Android':'Linux';
    headers.set('sec-ch-ua-platform',`"${platform}"`);
    const signal=AbortSignal.any([...(options.signal?[options.signal]:[]),AbortSignal.timeout(20000)]);
    try {
      const response=await directFetch(new URL(parsed.pathname+parsed.search,entry.origin).href,{...options,headers,signal,redirect:'error'});
      if([400,404].includes(response.status))return response;
      const validation=await validResponse(response,parsed,options);
      if(!validation.ok) {
        entry.blocked=true;last={...last,state:'browser',reason:validation.reason};return null;
      }
      if(validation.complete && !entry.blocked)last={state:'direct',reason:null,lastDirectSuccessAt:new Date(now()).toISOString()};
      return response;
    }catch {
      options.signal?.throwIfAborted();
      entry.blocked=true;last={...last,state:'browser',reason:'network-error'};return null;
    }
  }

  async function handoff(url,options={}) {
    const parsed=new URL(url),origin=almosaferOrigin(parsed.origin);
    if(parsed.username || parsed.password)throw new Error('Invalid source URL');
    options.signal?.throwIfAborted();
    if(!parsed.pathname.startsWith('/api/')) {
      const cached=states.get(origin);
      if(cached && cached.expires>now())return cached.documentResponse.clone();
      return bootstrap(origin,url,options);
    }
    // Other endpoints retain their established browser behavior.
    if(!parsed.pathname.startsWith('/api/enigma/v7/packages'))return browserFetch(url,options);
    let entry=states.get(origin);
    if(!entry || entry.expires<=now()) {
      const response=await bootstrap(origin,documentTarget(parsed,options),{signal:options.signal});
      entry=states.get(origin);
      if(!entry)return response;
    }
    if(entry.probing)await entry.probing;
    options.signal?.throwIfAborted();
    if(!entry.blocked) {
      // Share the first probe so concurrent days do not repeat a refusal.
      const first=entry.unchecked;
      const work=direct(parsed,options,entry);
      if(first)entry.probing=work.then(()=>{entry.unchecked=false;},()=>{}).finally(()=>{entry.probing=null;});
      const response=await work;
      if(response)return response;
    }
    counters.browserApiRequests++;
    return browserFetch(url,options);
  }
  handoff.snapshot=()=>({directAfterBootstrap:true,directTransport,...last,...counters});
  handoff.clear=()=>{states.clear();pending.clear();last={state:'unchecked',reason:null,lastDirectSuccessAt:null};};
  return handoff;
}
