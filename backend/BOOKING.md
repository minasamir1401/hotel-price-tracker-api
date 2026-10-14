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

## Account prices without a phone or emulator

The server can send an actual, externally provisioned account session using
`BOOKING_AUTH_TOKEN`. This is distinct from the application's identification
credentials. An email, a local OTP or a Genius flag cannot create this session.
Keep the account credential in private backend configuration. No endpoint accepts
it from the browser, and it is never included in results or diagnostics.

`BOOKING_AUTH_EXPIRES_AT` optionally supplies a known UTC ISO 8601 expiry.
`BOOKING_RATE_MODE` defaults to `auto`; a search can choose `bookingRateMode`:

- `auto`: use the configured account session, otherwise mobile guest prices.
- `account`: require an account session; missing/expired sessions fail explicitly.
- `guest`: omit the account credential even if the server has one configured.

The room picker, hotel discovery and every night of a stay use one bound session.
Room quotes, discovered rate IDs and background jobs have separate cache scopes
for guests and for different account credentials. A rejected account request
never falls back to a guest quote. Source prices and taxes are not discounted again.

Public status reports only whether a credential is configured, its known expiry,
and `loginVerified: false`. Configuration and a successful price response do not
prove account authentication. Each offer records its requested session context;
Genius is marked applied only when its verified source discount breakdown names
Genius. Prices can still differ by dates, eligibility and available promotions.

Account login/token acquisition is not implemented. A valid account session is
required before live account prices can be verified. Current live verification
covers mobile guest prices; account dispatch, isolation, expiry and source quotes
are tested with fixtures. The public disconnect route cannot clear a shared
server credential; use server configuration or select `guest` instead.

Personal account quotes are private. Configure a random `BOOKING_ACCOUNT_ACCESS_KEY`
of at least 32 characters in the backend, separately from `BOOKING_AUTH_TOKEN`.
The site owner uses the site's account-price access form. The key is exchanged
for a 30-minute HttpOnly, SameSite=Strict cookie (Secure in production), never a
Booking login. Account requests fail closed if this access key is absent or the
visitor is not authorized. Background jobs are bound to that access session;
another visitor cannot poll or join them. Guest requests remain public.

Use a cryptographically random owner API key, not a memorable password. Repeated
incorrect submissions are limited; a correct key remains usable even if nginx
puts multiple visitors behind one IP. Untrusted forwarded IP headers are ignored.

Production must serve the UI and `/api` over HTTPS under the same origin. Proxies
must preserve the original Host, including a port when applicable; alternatively
configure the exact `BOOKING_SITE_ORIGIN` in the backend. Changing the access key
invalidates existing cookies. Closing access clears the browser cookie and the
displayed results; already-issued cookies expire after 30 minutes.

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
