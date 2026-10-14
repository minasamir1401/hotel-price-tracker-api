import { createHash } from 'node:crypto';
import { UpstreamError } from './upstream-error.js';

const accountError = (message, code) => {
  const error = new UpstreamError(`Booking: ${message}`, { source: 'booking', stage: 'account-session', code });
  error.status = code === 'BOOKING_RATE_MODE_INVALID' ? 400 : 409;
  return error;
};

// Credentials come only from trusted server configuration, never search input.
// A configured credential is not proof of login or of Genius eligibility.
export function bookingPricingStatus(env = process.env, now = Date.now()) {
  const configured = Boolean(env.BOOKING_AUTH_TOKEN?.trim());
  const expiresAt = env.BOOKING_AUTH_EXPIRES_AT || null;
  const expiry = expiresAt ? Date.parse(expiresAt) : null;
  const expired = configured && expiry !== null && (!Number.isFinite(expiry) || expiry <= now);
  return { credentialConfigured: configured, expired, expiresAt, loginVerified: false,
    platform: 'mobile', defaultMode: env.BOOKING_RATE_MODE || 'auto' };
}

export function bookingAccountContext(env = process.env, mode = env.BOOKING_RATE_MODE || 'auto', now = Date.now()) {
  if (!['auto', 'guest', 'account'].includes(mode)) {
    throw accountError('اختر أسعار الموبايل بدون حساب أو أسعار الحساب', 'BOOKING_RATE_MODE_INVALID');
  }
  const status = bookingPricingStatus(env, now);
  const accountRequested = mode === 'account' || (mode === 'auto' && status.credentialConfigured);
  if (accountRequested && !status.credentialConfigured) {
    throw accountError('أسعار الحساب تحتاج جلسة Booking فعلية على الخادم. لا توجد جلسة مهيأة؛ يمكنك اختيار أسعار الموبايل بدون حساب.', 'BOOKING_ACCOUNT_SESSION_REQUIRED');
  }
  if (accountRequested && status.expired) {
    throw accountError('انتهت صلاحية جلسة الحساب؛ يلزم تجديدها من Booking', 'BOOKING_ACCOUNT_SESSION_EXPIRED');
  }
  const token = accountRequested ? env.BOOKING_AUTH_TOKEN.trim() : null;
  if (token && /[\r\n]/.test(token)) {
    throw accountError('بيانات جلسة الحساب غير صالحة', 'BOOKING_ACCOUNT_SESSION_INVALID');
  }
  return Object.freeze({ token, session: token ? 'account' : 'guest',
    expiresAt: token && status.expiresAt ? Date.parse(status.expiresAt) : null,
    // This fingerprint stays inside server caches; it is never sent to the UI.
    scopeId: createHash('sha256').update(JSON.stringify([token, env.BOOKING_LANGUAGE || 'ar',
      env.BOOKING_APP_VERSION, env.BOOKING_APP_DEVICE_ID, token && status.expiresAt])).digest('hex'),
  });
}

export function assertBookingAccountCurrent(context, now = Date.now()) {
  if (context.expiresAt !== null && context.expiresAt <= now) {
    throw accountError('انتهت صلاحية جلسة الحساب أثناء البحث؛ يلزم تجديدها', 'BOOKING_ACCOUNT_SESSION_EXPIRED');
  }
}
