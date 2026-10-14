// ScrapingAnt HTTP transport for Almosafer with round-robin key rotation and header translation.

import { defaultKeyPool } from './scrapingant-keys.js';
import { UpstreamError } from './upstream-error.js';
import { randomUUID } from 'node:crypto';

const SCRAPINGANT_API_ENDPOINT = 'https://api.scrapingant.com/v2/general';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'host',
  'content-length',
  'transfer-encoding',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'upgrade',
]);

function isHtmlRequest(url, headers = {}) {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.includes('/api/')) return false;
  if (pathname.startsWith('/ar/') || pathname.startsWith('/en/') || pathname.includes('hotels-home') || pathname.includes('hotel/details')) {
    return true;
  }
  const accept = (headers.get ? headers.get('accept') : headers.accept || headers.Accept) || '';
  return accept.includes('text/html');
}

function buildScrapingAntHeaders(targetHeaders, apiKey) {
  const result = {
    'x-api-key': apiKey,
  };

  const entries = targetHeaders instanceof Headers
    ? Array.from(targetHeaders.entries())
    : Object.entries(targetHeaders || {});

  for (const [rawKey, value] of entries) {
    if (!value) continue;
    const lower = rawKey.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) continue;

    if (lower.startsWith('ant-')) {
      result[rawKey] = value;
    } else {
      result[`ant-${rawKey}`] = value;
    }
  }

  result['x-api-key'] = apiKey;
  return result;
}

function buildTargetResponseHeaders(saHeaders) {
  const responseHeaders = new Headers();
  let hasContentType = false;

  for (const [k, v] of saHeaders.entries()) {
    const lower = k.toLowerCase();
    if (lower.startsWith('ant-original-header-')) {
      const originalName = lower.slice('ant-original-header-'.length);
      if (originalName === 'content-type') hasContentType = true;
      if (!HOP_BY_HOP_HEADERS.has(originalName)) {
        responseHeaders.append(originalName, v);
      }
    }
  }

  if (!hasContentType) {
    const rawCt = saHeaders.get('content-type');
    if (rawCt) responseHeaders.set('content-type', rawCt);
  }

  return responseHeaders;
}

export function createScrapingAntFetch({
  keyPool = defaultKeyPool,
  fetchImpl = fetch,
  endpoint = SCRAPINGANT_API_ENDPOINT,
} = {}) {
  async function scrapingAntFetch(targetUrl, options = {}) {
    options.signal?.throwIfAborted();

    const isHtml = isHtmlRequest(targetUrl, options.headers || {});
    const method = (options.method || 'GET').toUpperCase();
    const availableKeys = keyPool.getKeys();
    const maxRetries = Math.max(availableKeys.length * 3, 6);

    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      options.signal?.throwIfAborted();

      const apiKey = keyPool.getNextKey();
      const saUrl = new URL(endpoint);
      saUrl.searchParams.set('url', targetUrl);
      saUrl.searchParams.set('browser', isHtml ? 'true' : 'false');

      const saHeaders = buildScrapingAntHeaders(options.headers || {}, apiKey);

      const fetchOptions = {
        method: ['GET', 'HEAD'].includes(method) ? method : method,
        headers: saHeaders,
        signal: options.signal,
      };

      if (!['GET', 'HEAD'].includes(method) && options.body != null) {
        fetchOptions.body = options.body;
      }

      let res;
      try {
        res = await fetchImpl(saUrl.href, fetchOptions);
      } catch (err) {
        options.signal?.throwIfAborted();
        lastError = new UpstreamError(keyPool.redact(err.message || 'فشل الاتصال بخدمة ScrapingAnt'), {
          source: 'almosafer',
          stage: isHtml ? 'session-bootstrap' : 'api',
          code: 'SCRAPINGANT_NETWORK_ERROR',
        });
        continue;
      }

      if (res.status === 409) {
        await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
        lastError = new UpstreamError(
          `تم تجاوز حد التزامن في ScrapingAnt (${keyPool.maskKey(apiKey)}) بحالة 409، جاري التبديل للمفتاح التالي`,
          {
            source: 'almosafer',
            stage: isHtml ? 'session-bootstrap' : 'api',
            code: 'SCRAPINGANT_CONCURRENCY_LIMIT',
          }
        );
        continue;
      }

      if (res.status === 429 || res.status === 401 || res.status === 403) {
        keyPool.markKeyExhausted(apiKey);
        lastError = new UpstreamError(
          `تم رفض مفتاح ScrapingAnt (${keyPool.maskKey(apiKey)}) بحالة ${res.status}`,
          {
            source: 'almosafer',
            stage: isHtml ? 'session-bootstrap' : 'api',
            code: res.status === 429 ? 'SCRAPINGANT_QUOTA_EXCEEDED' : 'SCRAPINGANT_AUTH_FAILED',
          }
        );
        continue;
      }

      // Non-2xx is a provider failure, not the target site's HTTP status.
      // Target statuses arrive on successful responses in Ant-page-status-code.
      if (!res.ok) {
        const diagnosticId = randomUUID();
        const detected = res.status === 423;
        const error = new UpstreamError(`ScrapingAnt HTTP ${res.status}: ${detected
          ? 'تعذر الوصول للمسافر لأن المصدر رفض جلسة الاتصال'
          : 'خدمة الاتصال لم تُكمل الطلب'}؛ مرجع التشخيص ${diagnosticId}`, {
          source: 'almosafer', stage: isHtml ? 'session-bootstrap' : 'api',
          status: res.status, diagnosticId,
          code: detected ? 'SCRAPINGANT_TARGET_DETECTED' : 'SCRAPINGANT_PROVIDER_ERROR',
        });
        error.upstreamHost = new URL(endpoint).hostname;
        error.responseKind = detected ? 'challenge' : 'provider-error';
        throw error;
      }
      const pageStatusCode = Number(res.headers.get('ant-page-status-code')) || res.status;
      const responseHeaders = buildTargetResponseHeaders(res.headers);

      const responseBody = [204, 205, 304].includes(pageStatusCode) ? null : res.body;

      return new Response(responseBody, {
        status: pageStatusCode,
        headers: responseHeaders,
      });
    }

    throw lastError || new UpstreamError('فشلت جميع مفاتيح ScrapingAnt المتاحة', {
      source: 'almosafer',
      stage: isHtml ? 'session-bootstrap' : 'api',
      code: 'SCRAPINGANT_ALL_KEYS_EXHAUSTED',
    });
  }

  scrapingAntFetch.close = async () => {};
  scrapingAntFetch.keyPool = keyPool;

  return scrapingAntFetch;
}
