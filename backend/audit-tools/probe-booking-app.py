"""Read-only, unauthenticated probe of endpoints identified in the Booking APK.

Does not extract/send app credentials, signatures, cookies, or device tokens.
Does not solve challenges or rotate proxies. Not a working price scraper.
"""
import argparse
import hashlib
import json
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


def probe(output):
    output.mkdir(parents=True, exist_ok=True)
    results = []
    for host in ['mobile-apps.booking.com', 'secure-mobile-apps.booking.com']:
        for endpoint in ['mobile.searchResults', 'mobile.roomList']:
            url = f'https://{host}/json/{endpoint}'
            row = {'host': host, 'endpoint': endpoint, 'method': 'GET',
                   'authenticationSent': False, 'signatureSent': False,
                   'priceDataVerified': False}
            request = urllib.request.Request(url, headers={
                'User-Agent': 'BookingConnectivityDiagnostic/1.0',
                'Accept': 'application/json',
            })
            try:
                with urllib.request.urlopen(request, timeout=25) as response:
                    body = response.read(2_000_000)
                    row.update(httpStatus=response.status,
                               contentType=response.headers.get('Content-Type'),
                               server=response.headers.get('Server'))
            except urllib.error.HTTPError as error:
                body = error.read(2_000_000)
                row.update(httpStatus=error.code,
                           contentType=error.headers.get('Content-Type'),
                           server=error.headers.get('Server'))
            except (urllib.error.URLError, TimeoutError) as error:
                row['networkError'] = str(error.reason if isinstance(error, urllib.error.URLError) else error)
                body = b''
            row['bodyBytesSaved'] = len(body)
            row['cloudfrontBlocked'] = b'Request blocked.' in body and b'cloudfront' in body.lower()
            row['responseSha256'] = hashlib.sha256(body).hexdigest()
            filename = f'{host}-{endpoint}.body'
            (output / filename).write_bytes(body)
            row['responseFile'] = filename
            try:
                parsed = json.loads(body)
                row['jsonType'] = type(parsed).__name__
                if isinstance(parsed, dict):
                    row['jsonTopLevelKeys'] = sorted(parsed)
            except (ValueError, UnicodeError):
                row['jsonType'] = None
            results.append(row)
            print(json.dumps(row), flush=True)
    report = {'testedAtUtc': datetime.now(timezone.utc).isoformat(),
              'source': 'Endpoints identified through Booking Android APK static analysis',
              'androidRuntimeUsed': False, 'windowsLocalTestOnly': True,
              'authenticationSent': False, 'signatureSent': False,
              'appSessionObtained': False, 'priceScrapingVerified': False,
              'limitations': ['Unauthenticated reachability test only',
                              'No app session or live traffic capture',
                              'No Dokploy server test performed'],
              'requests': results}
    (output / 'probe-result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    return 0 if any(r.get('jsonType') for r in results) else 2


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default='outputs/booking-app-probe/unauthenticated')
    args = parser.parse_args()
    raise SystemExit(probe(Path(args.output)))
