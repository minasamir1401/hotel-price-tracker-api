import { createLiveScraper, datePairs } from './almosafer-live.js';
import { createBookingClient, validateBookingOccupancy } from './booking-client.js';
import { resolveBookingUrl } from './booking-url.js';

export const bookingClient = createBookingClient();
export async function resolveBookingDetails(input, params, client = bookingClient.forPricingMode(params.bookingRateMode)) {
  const roomsInfo = Array.from({ length: Number(params.rooms ?? 1) }, () => ({ adultsCount: Number(params.adults ?? 2), kidsAges: params.childAges || [] }));
  validateBookingOccupancy(roomsInfo);
  const first = datePairs(params.checkIn, params.checkOut)[0];
  return resolveBookingUrl(input, { checkIn: first.date, checkOut: first.nextDate, roomsInfo }, client);
}
export async function scrapeBooking(params) {
  // Bind the entire stay to one server-side session, including hotel discovery.
  const client = bookingClient.forPricingMode(params.bookingRateMode);
  const scrape = createLiveScraper(
    (input, query) => resolveBookingDetails(input, query, client),
    (input, options) => client.rooms(input, options),
    {
      source: 'Booking', sourceArabic: 'بوكينج',
      allowSameNameFallback: false,
      allowAlternativeFallback: false,
      bookingURL(details, { checkIn, checkOut, adults }) {
        const url = new URL(details.bookingUrl || 'https://www.booking.com/searchresults.html');
        url.searchParams.set('hotel_id', details.hotelId);
        url.searchParams.set('checkin', checkIn); url.searchParams.set('checkout', checkOut);
        url.searchParams.set('group_adults', String(adults)); url.searchParams.set('no_rooms', '1');
        url.searchParams.set('group_children', '0'); url.searchParams.set('selected_currency', 'SAR');
        return url.href;
      },
    });
  return scrape(params);
}
