# Nusuk Android hotel source

The backend reads the general hotel offers served to the Almatar SDK bundled in
`com.moh.nusukapp`. It does not run Android code or require an emulator, phone,
APK, Python or browser at runtime. Node.js sends the SDK's HTTPS requests.

## Confirmed request context

Inspected source: Nusuk 17.5.4, Huawei version code 166816, downloaded from the
Huawei listing linked by Nusuk's official `services.nusuk.sa/app/` page.
The APK's 288601744-byte size and SHA-256 matched the store response:
`ba9f22269d2fcf2e08f6666b94d8e1c6aebad442f732e78b0ceb4a25827f84e0`.
Signing-certificate metadata was parsed; it was not compared to a separate
Google Play signing-certificate reference.

`AlmatarInitializerKt.setupAlmatarSDK` obtains the production API URL from
`KeyManager.getAlmatarBaseUrl`: `https://apiout.almatar.com/`.
`nusuk.almatar.com` is the SDK's console URL, not the price API.
`AlmatarHttpClient` installs `LanguageInterceptor`, which identifies this client
with Platform `android`, SDK version `7.0.0`, Brand `1`, POS `SA`, and x-flow
`B2C`. The bundled HTTP library's User-Agent is `okhttp/5.3.0`.

The ordinary SDK flow with B2B disabled skips the Authorization header in this
interceptor. The implementation follows that general-price context. It does not
enable Hajj, B2B or account pricing, and does not claim a Nusuk account login.
The Nusuk interface itself checks login before opening hotels and can obtain a
separate SDK user token. Any prices requiring that account context remain
unverified. No app screen was compared on a physical phone.

The inspected Retrofit methods are:

- `GET /api/almtaar/hotelbyprofilekey/{hotel_key}` for property identity.
- `POST /api/hotel/v5/rooms/getpackages/search_with_hotel` for room offers.
- `POST /api/hotel/v4/rooms/getpackages/search_with_session_id` for polling.

The native first request sends numeric hotelId, countryCode, multiRoomMode=true,
and req containing cy, fd, td and rs/ac/cc/ka. Null sessionId is omitted.
Native polling sends almHotelId and queueSessionId only. Prices are never fetched
from `almatar.com`'s website as a fallback.

## Inputs and price rules

Select Nusuk, then enter an Almatar hotel rooms URL to identify the same property,
or `nusuk:` followed by its complete profile key, for example:
`nusuk:mecca-m-hotel-al-dana-makkah-millennium-1660326`.
Links on `apiout.almatar.com` automatically select Nusuk in the form and room
selector, for example
`https://apiout.almatar.com/ar/hotels/rooms/jeddah-intercontinental-jeddah-ihg-hotel-133244`.
The identity API must confirm the ID, profile key, name and Saudi country code.
Saudi hotels returned by this SDK service are accepted, including Jeddah; this
does not establish which cities are visible in the authenticated Android UI.
Coverage is one room, adults and no children. Name-only
search, numeric-ID-only input, children and multiple rooms are not supported yet.

Each night is requested separately. Accepted replies confirm the dates, SAR,
occupancy, completed search, hotel ID in every package, positive prices and room
price reconciliation. Empty replies confirm sold-out only when the completed
response explicitly says unavailable and names the verified property. Failures,
incomplete replies and conflicting duplicate package IDs are errors.

`finalPrice` is retained exactly as sourceTotalPrice. The displayed amount follows
the APK's `PriceManager.getPriceAccordingToRate` / `getCeilPrice(float)` rule:
ceil the Android float value to a whole riyal. No tax, discount or percentage is
added independently. Missing tax breakdowns remain unknown rather than zero.
Source package IDs, native rateId (including zero or null), room names, beds,
meal labels and cancellation conditions remain attached to each quote.
Full-board/all-inclusive and unrecognized meal plans are not mapped to half-board.
Different bed/view/size identities never become a direct same-room price for
another night merely because the room name matches.

Successful prices are cached for two minutes, confirmed empty availability for
20 seconds, and failures are not cached. Refresh starts a fresh price query.
Independent-night totals can differ from a continuous-stay booking.

## Validation on 13 October 2026

Live Node.js fetches and source receipt reconciliation succeeded for:

- M Hotel Al Dana Makkah by Millennium, 20–21 October: 8 room types, 23 quotes.
- Millennium Makkah Al Naseem, 21–22 October: 10 room types, 30 quotes.
- Al Kiswah Towers Hotel, 22–23 October: 4 room types, 4 quotes.
- InterContinental Jeddah, 20–21 October: 19 room types, 34 quotes; the exact
  `apiout.almatar.com` URL was resolved and every retained price was reconciled.

All 91 retained quote amounts were traced back to their live package records.
Workbooks for all 41 selectable room identities were serialized and read back,
verifying the displayed amounts and source labels. A browser test also searched
through the actual background API, displayed Nusuk results and downloaded the
actual Excel file. It checks that an Almatar identity URL with Nusuk selected
does not accidentally use the Almatar daily-price route.
The Jeddah browser test started with Almatar selected, pasted the exact APIout
URL, verified automatic Nusuk selection, loaded 19 room identities, checked the
hotel ID in the returned quotes and downloaded the real Excel export.

These are timestamped general SDK offers, not a visual physical-phone comparison
or verification of account-specific discounts or production server acceptance.

Reproduce from the repository root:

```
node backend/tests/nusuk.test.js
node backend/audit-tools/verify-nusuk-live.mjs --live
```

For another covered property/date, add `--url HOTEL_ROOMS_URL` or
`--profile FULL_PROFILE_KEY`, and
`--check-in YYYY-MM-DD`. Local request/response evidence and sanitized reports
remain in ignored `outputs/nusuk-app-probe/`. APK inspection tools save code as
data and reuse the local Androguard tools from the Booking investigation; they
are not production dependencies. Never publish raw APK/disassembly/session data.
