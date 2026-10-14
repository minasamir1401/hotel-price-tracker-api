// An email or locally generated OTP is not a Booking account session.
// Keep this interface unavailable until Booking itself authenticates the user.
import { bookingPricingStatus } from './booking-account-context.js';
const unavailable = () => ({
  success: false,
  code: 'BOOKING_ACCOUNT_NOT_CONNECTED',
  message: 'ربط حساب Booking غير متاح حاليًا؛ لا يتم إرسال رمز من Booking أو تفعيل خصم Genius محليًا.',
});
export function requestOtp() { return unavailable(); }
export function verifyOtp() { return unavailable(); }
export function clearBookingSession() {
  // This public route cannot change a server-wide credential for other users.
  if (bookingPricingStatus().credentialConfigured) return {
    success: false, code: 'BOOKING_ACCOUNT_SESSION_SERVER_CONFIGURED',
    message: 'جلسة الأسعار مهيأة على الخادم؛ إلغاء استخدامها يتم من إعدادات الخادم أو اختيار أسعار الموبايل بدون حساب.',
  };
  return { success: true, message: 'لا توجد جلسة حساب متصلة' };
}
export function getBookingSessionData() { return null; }
export function isBookingSessionActive() { return false; }
