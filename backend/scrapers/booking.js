import { createLiveScraper, datePairs } from './almosafer-live.js';
import { createBookingClient, validateBookingOccupancy } from './booking-client.js';
import { resolveBookingUrl } from './booking-url.js';

export const bookingClient = createBookingClient();
export async function resolveBookingDetails(input, params) {
  const roomsInfo = Array.from({ length: Number(params.rooms ?? 1) }, () => ({ adultsCount: Number(params.adults ?? 2), kidsAges: params.childAges || [] }));
  validateBookingOccupancy(roomsInfo);
  const first = datePairs(params.checkIn, params.checkOut)[0];
  return resolveBookingUrl(input, { checkIn: first.date, checkOut: first.nextDate, roomsInfo }, bookingClient);
}
export const scrapeBooking = createLiveScraper(resolveBookingDetails, (input, options) => bookingClient.rooms(input, options), {
  source: 'Booking', sourceArabic: 'بوكينج',
  bookingURL(details, { checkIn, checkOut, adults }) {
    const url = new URL(details.bookingUrl || 'https://www.booking.com/searchresults.html');
    url.searchParams.set('hotel_id', details.hotelId);
    url.searchParams.set('checkin', checkIn); url.searchParams.set('checkout', checkOut);
    url.searchParams.set('group_adults', String(adults)); url.searchParams.set('no_rooms', '1');
    url.searchParams.set('group_children', '0'); url.searchParams.set('selected_currency', 'SAR');
    return url.href;
  },
});
