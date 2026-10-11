# Booking app source

The backend uses the inspected Android app's `mobile.hotelPage` and
`mobile.roomList` endpoints directly over HTTPS. It needs Node.js only; the APK,
Python, a phone and an emulator are not runtime dependencies.

Configure `BOOKING_APP_AUTHORIZATION`, `BOOKING_APP_SIGNATURE_SALT`,
`BOOKING_APP_VERSION` and optionally a stable `BOOKING_APP_DEVICE_ID` as private
backend environment variables. Values from the authorized APK inspection stay in
ignored `outputs/booking-app-probe/server.env`; never send them to the frontend.
Docker Compose forwards the same environment variables. A root-Dockerfile
Dokploy deployment can set them directly in its backend environment.

For the current Windows checkout:

```powershell
python backend/audit-tools/configure-booking-local.py
cd backend
node --env-file=../outputs/booking-app-probe/server.env server.js
```

Start the frontend separately with `npm run dev` in `frontend`.

Input supports `booking:184752`, a numeric Booking hotel ID when Booking is
selected, or a Booking URL containing `hotel_id` or `dest_id` with `dest_type=hotel`.
City destination IDs are never used as hotel IDs. Full property URLs can also
resolve through their linked room blocks: a candidate is accepted only when the
app confirms that all linked room IDs belong to that hotel. Plain property URLs
use public identity metadata when available, then verify through the app. A
blocked metadata page or an unconfirmed room is an explicit error; no hotel ID
or price is invented. Hotel-name-only search is currently unsupported.
One room without children is supported. Multi-room and child pricing are rejected
until their API semantics are verified. Adult occupancy is matched against the
actual returned distribution and every accepted block.

Every night is requested separately. Each returned hotel ID, dates, SAR currency,
occupancy and complete native block list is checked. The displayed
`roomList.block.min_price.price` already includes requested taxes; hotelPage taxes
are not added a second time. Source block IDs, bed configurations, meal labels
and cancellation flags are retained. Supplier TPI blocks, full-board and
all-inclusive offers are excluded because the existing table covers native
room-only, breakfast and half-board rates. This is therefore not exhaustive
coverage of all Booking suppliers or meal plans.

Completed room responses are cached for two minutes; failures are not cached.
The app API is private and its identification/version may change. A rejection or
unrecognized response is an error, never a fabricated price or confirmed sold-out
night. Independent night totals may differ from a continuous-stay booking price.
