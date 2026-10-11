import {readBedOptions} from './beds.js';
import {createAlmosaferSessionProvider, webUserAgent} from './almosafer-session.js';
import { upstreamHttpError, UpstreamError } from './upstream-error.js';
import { recordSourceSuccess, recordSourceFailure } from './source-status.js';
const plans = { RO: 'roomOnly', BB: 'breakfast', HB: 'halfBoard' };
export const roundMoney = value => Math.round((value + Number.EPSILON) * 100) / 100;
const localized = value => typeof value === 'string' ? value : value?.ar || value?.en || '';

// A missing plan stays null. Offers are compared within the same room and meal plan.
export function parsePackages(poll, adults, roomsCount) {
  const result = {};
  if (poll.currencyCode && poll.currencyCode !== 'SAR') throw new Error('المسافر رجع عملة مختلفة عن الريال السعودي');
  for (const group of poll.packagesGroups || []) {
    for (const pkg of group.packages || []) {
      if (pkg.bookable !== true) continue;
      const rooms = pkg.rooms || [];
      if (rooms.length !== roomsCount) continue;
      const room = rooms[0];
      const plan = plans[room?.roomBasis];
      if (!plan || !room || rooms.some(r => r.roomBasis !== room.roomBasis)) continue;
      const info = pkg.packageRateInfo;
      if (info?.currency && info.currency !== 'SAR') continue;
      const total = Number(info?.total);
      if (!Number.isFinite(total) || total <= 0) continue;
      const category = localized(group.title) || 'غرفة فندقية';
      const names = rooms.map(r => localized(r.roomName) || category);
      const beds = rooms.map(readBedOptions);
      // A shared marketing title cannot identify a room. Keep variants and unknown beds separate.
      const identity = rooms.map((r,i)=>{
        const bed=beds[i];
        const known=bed.options.length>0&&bed.options.every(o=>o.count&&o.type);
        // Supplier/template ids may change between nights for the same explicitly described beds.
        return known?JSON.stringify({beds:bed.options,view:r.rmsDetail?.view || ''}):[r.rmsDetail?.matchingCode || r.rmsDetail?.hashCode || '',r.originalRoomName || '',r.templateId || '',bed.label || '',r.rmsDetail?.view || ''].join(':');
      }).join('/');
      const name = names.join(' / ');
      const key = identity.replace(/[:/]/g,'') ? `${name}::${identity}` : name;
      if (!result[key]) result[key] = { name, category, capacity: adults, beds,beddingLabel:beds.map(b=>b.label || 'لم يحدد المصدر').join(' / '),beddingVerified:beds.every(b=>b.label),originalNames:rooms.map(r=>r.originalRoomName || null),offers: {} };
      // Keep precision when dividing a package across multiple rooms; round only display/aggregates.
      const rate = total / roomsCount;
      const flexible = pkg.cancellationPolicy?.hasFreeCancellation === true;
      const fields = [plan, ...(flexible ? [`${plan}Flexible`] : [])];
      for (const field of fields) {
        const previous = result[key].offers[field];
        if (!previous || rate < previous.price) {
          result[key].offers[field] = {
            price: rate, totalPrice: roundMoney(total), packageId: pkg.packageId || pkg.id || null,
            vendorSupplierId: pkg.vendorSupplierId ?? null, contractId: pkg.contractId ?? null,
            cancellationPolicy: flexible ? 'إلغاء مجاني' : 'غير مستردة',
            mealLabel:{RO:'إقامة فقط',BB:'إقامة وفطور',HB:'وجبتان'}[room.roomBasis],
            cancellationDetails: pkg.cancellationPolicy?.cancellationPolicyDetails || [],
            roomIdentity:key, originalRoomNames:rooms.map(r=>r.originalRoomName || null),templateIds:rooms.map(r=>r.templateId || null),
          };
        }
      }
    }
  }
  return result;
}

export function createEnigmaClient({ fetchImpl = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), now = Date.now, token = process.env.ALMOSAFER_API_TOKEN?.trim(), cacheTTL = 120000, sessionProvider } = {}) {
  const cache = new Map();
  const pending = new Map();
  const getSessionToken = sessionProvider || createAlmosaferSessionProvider({fetchImpl, now});
  let overrideRejected = false;
  const headers = {
    'User-Agent': webUserAgent,
    Accept: 'application/json', 'Content-Type': 'application/json',
    Origin: 'https://www.almosafer.com',
    'x-api-key': 'apikey-hotel',
    'x-app-name': 'ct-web-hotels-app', 'x-bt': 'next', 'x-platform': 'web',
    'x-currency': 'SAR', 'x-locale': 'ar',
    'Cache-Control': 'private, no-cache, no-store, must-revalidate', Pragma: 'no-cache', Expires: '-1',
  };
  async function json(url, options, deadline, requestHeaders) {
    const remaining = deadline - now();
    if (remaining <= 0) throw new Error('انتهت مهلة استعلام هذه الليلة');
    let res;
    try { res = await fetchImpl(url, { headers: requestHeaders, signal: AbortSignal.timeout(Math.min(20000,remaining)), ...options }); }
    catch { throw new UpstreamError('تعذر الاتصال بالمسافر أو انتهت مهلة الطلب', { source: 'almosafer', stage: url.includes('/poll/') ? 'poll' : 'packages', code: 'UPSTREAM_NETWORK_ERROR' }); }
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) { overrideRejected = true; getSessionToken.invalidate?.(); }
      throw await upstreamHttpError(res, { stage: url.includes('/poll/') ? 'poll' : 'packages', url });
    }
    return res.json();
  }
  async function query(payload, deadline) {
    // Use the public web token; the injected placeholder general-key changes the offer pool.
    const sessionToken = token && !overrideRejected ? token : await getSessionToken(payload, deadline);
    const cookieHeader = getSessionToken?.cookieHeader;
    const requestHeaders = {
      ...headers,
      token: sessionToken,
      Referer: `https://www.almosafer.com/ar/hotel/details/atg/hotel-${payload.hotelId}`,
      'sec-ch-ua-platform': '"Windows"',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };
    const init = await json('https://www.almosafer.com/api/enigma/v7/packages', { method: 'PUT', body: JSON.stringify(payload) }, deadline, requestHeaders);
    if (!init.pId) throw new Error('لم يرجع المسافر رقم استعلام صالح');
    if (init.pId.startsWith('no-pkg') && !init.hotelId) {
      getSessionToken.invalidate?.();
      throw new Error('تعذر تأكيد توفر هذه الليلة: المسافر لم ينشئ استعلام عروض صالحًا');
    }
    if (String(init.hotelId) !== String(payload.hotelId)) throw new Error('المسافر رجع عروض فندق مختلف');
    const rawInitDelay = Number(init.initialDelayInMillis);
    const waitFirst = Number.isFinite(rawInitDelay) && rawInitDelay > 0
      ? Math.min(1500, Math.max(500, Math.floor(rawInitDelay * 0.4)))
      : 800;
    await sleep(waitFirst);
    for (let attempt = 0; attempt < 40; attempt++) {
      const poll = await json(`https://www.almosafer.com/api/enigma/v7/packages/poll/${encodeURIComponent(init.pId)}`, {}, deadline, requestHeaders);
      if (poll.pollingStatus === 'COMPLETED_SUCCESSFULLY') {
        // An empty transport/session response is not proof that the hotel is sold out.
        if (!poll.hotelId || !poll.currencyCode || !poll.numberOfNights || !Array.isArray(poll.packagesGroups)) {
          getSessionToken.invalidate?.();
          throw new Error('تعذر تأكيد توفر هذه الليلة: بيانات نتيجة المسافر غير مكتملة');
        }
        if (String(poll.hotelId) !== String(payload.hotelId)) throw new Error('نتيجة الاستعلام تخص فندقًا مختلفًا');
        if (poll.numberOfNights !== 1) throw new Error('نتيجة الاستعلام ليست لليلة واحدة');
        if (Number(poll.numberOfPackages) > 0 && !poll.packagesGroups.some(g => g.packages?.length)) throw new Error('تعذر تأكيد توفر هذه الليلة: لم تصل عروض المسافر المعلنة');
        return parsePackages(poll, payload.roomsInfo[0].adultsCount, payload.roomsInfo.length);
      }
      if (poll.pollingStatus !== 'IN_PROGRESS') throw new Error(`لم يكتمل استعلام المسافر: ${poll.pollingStatus || 'حالة مجهولة'}`);
      const rawPollDelay = Number(poll.delayInMillis);
      const waitPoll = Number.isFinite(rawPollDelay) && rawPollDelay > 0
        ? Math.min(2000, Math.max(500, Math.floor(rawPollDelay * 0.6)))
        : 800;
      await sleep(waitPoll);
    }
    throw new Error('انتهت مهلة تحميل جميع عروض المسافر');
  }
  return async (payload, { refresh = false, maxAttempts = 2 } = {}) => {
    maxAttempts = Math.max(1, Math.min(3, Number(maxAttempts) || 2));
    const key = JSON.stringify(payload);
    const cached = cache.get(key);
    if (!refresh && cached && cached.expires > now()) return cached.value;
    if (pending.has(key)) return pending.get(key);
    const promise = (async () => {
      // A slow first poll must not consume the retry's own timeout budget.
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const deadline = now() + 45000;
        try {
          const value = await query(payload, deadline);
          if (Object.keys(value).length || attempt === maxAttempts - 1) return value;
        } catch (error) {
          if (attempt === maxAttempts - 1 || error.upstreamStatus === 400 || error.upstreamStatus === 404 || error.stage === 'session-bootstrap') throw error;
        }
        await sleep(Math.max(300, 400 * (attempt + 1)));
      }
    })().then(value => {
      recordSourceSuccess('almosafer');
      // Limit storage and cache only final responses; failed/partial polls never persist.
      for (const [k, entry] of cache) if (entry.expires <= now()) cache.delete(k);
      if (cache.size >= 1000) cache.delete(cache.keys().next().value);
      cache.set(key, { value, expires: now() + (Object.keys(value).length ? cacheTTL : 5000) });
      return value;
    }).catch(error => { recordSourceFailure('almosafer', error); throw error; }).finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  };
}
