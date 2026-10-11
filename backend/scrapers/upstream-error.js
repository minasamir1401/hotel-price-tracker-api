import { randomUUID } from 'node:crypto';

export class UpstreamError extends Error {
  constructor(message, { source, stage, status, code = 'UPSTREAM_ERROR', diagnosticId } = {}) {
    super(message);
    this.name = 'UpstreamError';
    this.source = source;
    this.stage = stage;
    this.upstreamStatus = status;
    this.code = code;
    this.diagnosticId = diagnosticId;
  }
}

// Do not print request headers, cookies, response bodies, URL queries or tokens.
// Structural evidence identifies the refusal while keeping credentials private.
export async function upstreamHttpError(response, { source = 'almosafer', label = 'المسافر', stage, url, logger = console.warn } = {}) {
  let body = '';
  try { body = (await response.text()).slice(0, 16384); } catch { /* diagnostics are best effort */ }
  const headers = Object.fromEntries(['server', 'content-type', 'x-cache', 'retry-after', 'cf-ray'].map(key => [key, response.headers?.get?.(key)]).filter(([, value]) => value));
  const kind = /captcha|verify you are human|challenge-platform/i.test(body) ? 'challenge'
    : /cloudfront|request blocked|access denied|forbidden/i.test(body) ? 'access-denied'
    : /invalid.?token|unauthori[sz]ed|token.{0,40}expir/i.test(body) ? 'authentication'
    : /<html|<!doctype/i.test(body) ? 'html' : 'unknown';
  const diagnosticId = randomUUID();
  logger('[UPSTREAM FAILURE]', JSON.stringify({ diagnosticId, source, stage, status: response.status, host: new URL(url).hostname, path: new URL(url).pathname, responseKind: kind, headers }));
  const reason = kind === 'challenge' ? 'المصدر طلب تحققًا إضافيًا من اتصال الخادم'
    : kind === 'access-denied' ? 'المصدر رفض الوصول من هذا الاتصال'
    : kind === 'authentication' ? 'المصدر رفض بيانات الجلسة' : 'المصدر رفض الطلب';
  const error = new UpstreamError(`${label} HTTP ${response.status}: ${reason}؛ مرجع التشخيص ${diagnosticId}`, {
    source, stage, status: response.status, diagnosticId,
    code: response.status === 403 ? 'UPSTREAM_ACCESS_DENIED' : response.status === 401 ? 'UPSTREAM_AUTH_REJECTED' : 'UPSTREAM_HTTP_ERROR',
  });
  error.upstreamHost = new URL(url).hostname;
  return error;
}
