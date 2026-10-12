# Almosafer via Bright Data Browser API

Set these variables privately on the backend service in Dokploy, then redeploy:

```dotenv
ALMOSAFER_HTTP_TRANSPORT=brightdata
ALMOSAFER_BROWSER_WS_ENDPOINT=wss://ZONE_USERNAME:ZONE_PASSWORD@brd.superproxy.io:9222
ALMOSAFER_BROWSER_ORIGIN=https://www.almosafer.com
ALMOSAFER_API_TOKEN=
ALMOSAFER_PROXY_URL=
```

Use the existing Browser API zone password, not an account API token or a Selenium endpoint. Never put the real endpoint in Git, frontend variables, screenshots or public logs. The optional origin override uses only the two allowed Almosafer hosts and keeps the hotel identifier unchanged.

A live local test on 12 October 2026 succeeded with the zone username's documented `-country-eg` suffix and the `www` origin. The same zone's automatic location and `global` origin returned Cloudflare access denial. This is a verified configuration for that test, not a guarantee of future access or identical regional offers.

## Month jobs and cost control

The frontend's **30 يوماً (مهمة واحدة)** preset submits one background job:

```http
POST /api/search-hotel-prices
Content-Type: application/json

{"hotelInput":"ALMOSAFER_HOTEL_LINK","checkIn":"2026-10-20","checkOut":"2026-11-19","adults":2,"rooms":1,"sources":["almosafer"],"background":true}
```

The response is HTTP 202 with `jobId`. Poll `GET /api/search-jobs/:id` for progress and the final source result. Submitting the same running search reuses its job. A browser connection dropping does not cancel server execution. Jobs are stored in memory for 30 minutes after completion; restarting or redeploying the backend loses them. Multiple backend replicas do not share this store.

Each date is a separate one-night quote, not a division of a continuous 30-night booking. One job still issues separate source searches and polling requests for its days; Bright Data's traffic billing is not reduced to one billed request.

The remote transport reuses one browser per source origin, bootstraps once, retains its source cookies and token, limits daily concurrency to two, blocks hotel images/fonts/media and closes an idle browser after 30 seconds. It does not launch a local browser or emulator. Confirmed empty inventory is not retried; source authentication/WAF failures stop further days instead of consuming a whole month of unsuccessful calls. There are at most two active comparison jobs.

For Cloudflare access denial, inspect the diagnostic ID, source host and stage before retrying. `BRIGHTDATA_AUTH_FAILED` is a zone credential problem; a source HTTP 403 after connection is a separate refusal. Resource blocking can be disabled through the transport factory for a bounded diagnostic test; it is not an automatic paid retry loop.

## Verification

A live 30-night job for hotel `1287944`, 20 October–19 November 2026, two adults and one room, completed in approximately 185 seconds and returned four source room variants, 30 dated rows per variant and SAR currency. There were confirmed responses for 29 nights; 15 November was explicitly reported as an invalid source query, without a substitute price. Retrying that night with a fresh session succeeded and returned three source rooms. Availability differs by room and date. Backend tests cover shared bootstrap, remote-only connections, privacy, cost-saving failure stops and background job deduplication; frontend tests cover job polling and source diagnostics.

Official references: [Browser API geolocation](https://docs.brightdata.com/products/scraping-browser/features/proxy-location), [Browser API FAQ](https://docs.brightdata.com/products/scraping-browser/faqs).
