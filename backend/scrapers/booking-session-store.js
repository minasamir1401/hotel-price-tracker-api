// An email or locally generated OTP is not a Booking account session.
// Keep this interface unavailable until Booking itself authenticates the user.
const unavailable = () => ({
  success: false,
  code: 'BOOKING_ACCOUNT_NOT_CONNECTED',
  message: 'ربط حساب Booking غير متاح حاليًا؛ لا يتم إرسال رمز من Booking أو تفعيل خصم Genius محليًا.',
});
export function requestOtp() { return unavailable(); }
export function verifyOtp() { return unavailable(); }
export function clearBookingSession() {}
export function getBookingSessionData() { return null; }
export function isBookingSessionActive() { return false; }
