import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const cookieName = 'booking_price_access';
const ttl = 30 * 60 * 1000;
const failure = (message, code, status) => Object.assign(new Error(message), { code, status });
const equal = (a, b) => {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

// Site-owner access is separate from Booking login and cannot create Genius eligibility.
export function createBookingPriceAccess({ env = process.env, now = Date.now } = {}) {
  const attempts = new Map();
  const key = () => typeof env.BOOKING_ACCOUNT_ACCESS_KEY === 'string' && env.BOOKING_ACCOUNT_ACCESS_KEY.length >= 32
    ? env.BOOKING_ACCOUNT_ACCESS_KEY : null;
  const sign = value => createHmac('sha256', key()).update(value).digest('base64url');
  const checkOrigin = req => {
    if (!req.headers.origin) return;
    try {
      const origin = new URL(req.headers.origin);
      if (env.BOOKING_SITE_ORIGIN) {
        if (origin.origin === new URL(env.BOOKING_SITE_ORIGIN).origin) return;
      } else if (['http:', 'https:'].includes(origin.protocol) && origin.host === req.headers.host) return;
    } catch {}
    throw failure('طلب دخول أسعار الحساب من مصدر غير مسموح', 'BOOKING_ACCESS_ORIGIN_REJECTED', 403);
  };
  function session(req) {
    if (!key()) return null;
    const raw = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    if (!raw || raw.length > 2048) return null;
    const [data, signature, extra] = raw.split('.');
    if (!data || !signature || extra !== undefined || !equal(sign(data), signature)) return null;
    try {
      const parsed = JSON.parse(Buffer.from(data, 'base64url').toString());
      return typeof parsed.scope === 'string' && /^[a-f0-9]{64}$/.test(parsed.scope) &&
        Number.isFinite(parsed.expiresAt) && parsed.expiresAt > now() && parsed.expiresAt <= now() + ttl ? parsed : null;
    } catch { return null; }
  }
  const cookie = (value, expired = false) => `${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${expired ? 0 : ttl / 1000}${env.NODE_ENV === 'production' ? '; Secure' : ''}`;
  return {
    status(req) { checkOrigin(req); const active = session(req); return { available: Boolean(key()), authorized: Boolean(active), expiresAt: active?.expiresAt || null }; },
    ownerScope(req) { checkOrigin(req); return session(req)?.scope || null; },
    authorize(req, sessionType) {
      if (sessionType !== 'account') return null;
      checkOrigin(req);
      if (!key()) throw failure('أسعار الحساب تحتاج إعداد مفتاح دخول خاص لصاحب الموقع على الخادم', 'BOOKING_ACCOUNT_ACCESS_NOT_CONFIGURED', 409);
      const active = session(req);
      if (!active) throw failure('سجّل دخول أسعار الحساب بمفتاح صاحب الموقع أولًا', 'BOOKING_ACCOUNT_ACCESS_REQUIRED', 401);
      return active.scope;
    },
    login(req, suppliedKey) {
      checkOrigin(req);
      if (!key()) throw failure('دخول أسعار الحساب غير مهيأ على الخادم', 'BOOKING_ACCOUNT_ACCESS_NOT_CONFIGURED', 409);
      for (const [ip, value] of attempts) if (value.until <= now()) attempts.delete(ip);
      const ip = req.ip || 'local';
      const previous = attempts.get(ip) || { count: 0, until: now() + 15 * 60 * 1000 };
      // The credential is a high-entropy owner API key, not a user password.
      // A shared reverse-proxy IP must never let failed attempts lock out the
      // owner who supplies the correct key. Forwarded IP headers are not trusted.
      if (typeof suppliedKey !== 'string' || suppliedKey.length > 1024 || !equal(key(), suppliedKey)) {
        if (previous.count >= 5 || (!attempts.has(ip) && attempts.size >= 1000)) throw failure('محاولات دخول كثيرة؛ حاول لاحقًا', 'BOOKING_ACCESS_RATE_LIMITED', 429);
        attempts.set(ip, { ...previous, count: previous.count + 1 });
        throw failure('مفتاح الدخول غير صحيح', 'BOOKING_ACCESS_INVALID', 401);
      }
      attempts.delete(ip);
      const payload = { scope: randomBytes(32).toString('hex'), expiresAt: now() + ttl };
      const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
      return { cookie: cookie(data + '.' + sign(data)), expiresAt: payload.expiresAt };
    },
    logout(req) { checkOrigin(req); return cookie('', true); },
  };
}
