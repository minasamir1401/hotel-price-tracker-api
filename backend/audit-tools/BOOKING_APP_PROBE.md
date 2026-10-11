# Booking Android investigation on Windows

The one-hotel, one-night experiment successfully retrieved and verified native
Booking room offers from the Android app's API on Windows. It is a local
prototype and has not been integrated into the website or deployed to Dokploy.
It uses no emulator or physical phone. All generated files and the downloaded
APK are in `outputs/booking-app-probe/`, which is ignored by Git and Docker.
The application server, existing sources, and frontend were not changed.

## Download and static inspection

- Source: https://apkpure.net/booking-com-hotels-and-more-app/com.booking/download
- Package: `com.booking`; version: `67.4.0.11`; version code: `901770`.
- File: `outputs/booking-app-probe/booking.apk`; size: 333081513 bytes.
- SHA-256: `be7bc81cc247017ec3c4e1c357e929fe3a59463e6f127a95eb34ea6ca287972e`.
- The file hash matches the hash published by the download mirror.
- APK v2 signature/certificate metadata was parsed. This does not independently
  establish publisher identity or certify the APK as safe to execute.
- The file was inspected as data; the Android application was not installed or run.

Reproduce the inventory with Python 3.11+:

```powershell
python backend/audit-tools/inspect-booking-apk.py outputs/booking-app-probe/booking.apk outputs/booking-app-probe
```

Androguard is installed only into `outputs/booking-app-probe/tools`. If present,
the inspection command also saves package/version and signing-certificate metadata.
`booking-dex-methods.py` uses this local library to locate code references to
request construction. Method evidence is local and may contain embedded app
identification values; do not publish the disassembly files.

## Unauthenticated connectivity test

```powershell
python backend/audit-tools/probe-booking-app.py
```

The script sends four GET requests to the APK-identified `mobile.searchResults`
and `mobile.roomList` paths on `mobile-apps.booking.com` and
`secure-mobile-apps.booking.com`. It does not send app authentication,
signatures, device tokens, or cookies. All four tested requests returned HTTP 401
with a plain-text response. The earlier curl test of `mobile.getToken` returned
HTTP 403 from CloudFront. These results do not prove which specific authenticated
request fields are required, or that a device is required.

Raw responses and `probe-result.json` are saved to
`outputs/booking-app-probe/unauthenticated/`. Exit code 2 indicates that no JSON
response was obtained. No prices, rooms, availability, or session were verified.
The Dokploy deployment was not tested or modified.

## Authenticated experiment and verified result

The user explicitly approved use of the app's embedded identification and
request-signature constants. The bounded read-only test then ran successfully.
The script keeps its original `booking-app-auth-pending.py` filename, but the
approval is resolved. It loads these constants from local ignored inspection
evidence; no credentials are hardcoded into source or printed in console logs.

```powershell
python backend/audit-tools/booking-app-auth-pending.py --check-in 2026-10-20 --check-out 2026-10-21 --hotel-id 184752 --confirm-app-identification --output outputs/booking-app-probe/almarwa-detail
python backend/audit-tools/verify-booking-app-result.py
```

The APK's common request builder uses `user_version=67.4.0.11-android`.
Search parameters were reconstructed from `SearchQueryExtKt`; hotel flags from
`HotelPageRequestBuilder`. The diagnostic uses a locally generated client ID
and a synthetic Android client profile, not a real phone or device attestation.
`mobile.getToken` was found to serve messaging tokens and is not used by the
successful hotel experiment. Search uses `mobile-apps.booking.com`; the secure
host returned method-not-found for search and is not used for further requests.

Verified snapshot: Al Marwa Rayhaan by Rotana - Makkah, hotel ID `184752`,
20–21 October 2026, one room, two adults, no children, SAR. Hotel-page and
room-list endpoints returned HTTP 200 with matching hotel ID, dates, currency,
and occupancy. The complete native room list contained 18 offers across 6 room
types, including breakfast and half-board offers and explicit cancellation and
bed information. One TPI supplier offer is excluded from normalization because
it needs separate validation; it is not merged with a native Booking room.

For native block `18475208_91466012_2_1_0`, the hotel-page response returned
SAR 2093.50 plus excluded VAT 329.73 and municipality fee 104.67. Their exact
sum, SAR 2527.90, matches the room-list display price for the same block.
This offer has two single beds, breakfast, and a non-refundable policy.
Other native block prices are retained directly from the room-list source;
tax reconciliation is marked verified only for the matched sample block.

The normalized, token-free result is saved as
`outputs/booking-app-probe/almarwa-detail/verified-offers.json`. The verifier
checks hotel identity, dates, one-night duration, two-adult occupancy, SAR,
block completeness and uniqueness, source meal flags, room metadata, positive
prices, and the sample tax reconciliation. Negative checks also rejected a
wrong hotel, wrong date, wrong occupancy, wrong currency, and altered price.

This proves local API access for the tested context. It does not verify a
Genius account, visual equality to a running app screen, longer date ranges,
other hotels, request longevity, server-IP acceptance, or production integration.
Prices are a timestamped snapshot and can change. Raw responses remain local
and may contain provider booking tokens; do not publish them.
