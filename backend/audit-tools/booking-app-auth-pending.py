"""Read-only probe with APK identification; explicitly authorized by the user.

No Android runtime, login, reservation, proxy rotation, or challenge solving.
This is a diagnostic, not a price scraper. It never reports an error as no rooms.
Authentication constants stay in ignored local APK evidence, not source code/logs.
"""
import argparse
import base64
import hashlib
import json
import re
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path


def literal(instruction):
    return instruction.split(', ', 1)[-1].strip('"')


def app_identification(evidence):
    methods = json.loads((evidence / 'dex1-methods.json').read_text(encoding='utf-8'))
    backend = next(m for m in methods if m['class'] == 'Lcom/booking/network/util/BackendSettings;' and m['method'] == '<clinit>')
    credentials = next(literal(i) for i in backend['instructions'] if i.startswith('const-string') and ':' in literal(i))
    network = json.loads((evidence / 'dex1-network.json').read_text(encoding='utf-8'))
    signer = next(m for m in network if m['class'] == 'Lcom/booking/common/http/RequestSignatureInterceptor;' and m['method'] == '<clinit>')
    encoded = next(literal(i) for i in signer['instructions'] if i.startswith('const-string') and len(literal(i)) == 52)
    chars = []
    index = 26
    while 0 <= index < len(encoded):
        chars.append(encoded[index])
        index += -len(chars) if len(chars) % 2 else len(chars)
        if len(chars) > len(encoded):
            raise ValueError('Unexpected signature constant layout')
    spice = base64.b64decode(''.join(chars)).decode('utf-8')
    metadata = json.loads((evidence / 'apk-metadata.json').read_text(encoding='utf-8'))
    version = metadata['versionName']
    headers = {
        'User-Agent': f'Booking.com Android App {version} (OS: 15; Type: mobile; AppStore: google; Brand: Google; Model: Pixel 8;)',
        'Authorization': 'Basic ' + base64.b64encode(credentials.encode()).decode(),
        'Accept': 'application/json',
        'X-LIBRARY': 'okhttp+network-api',
    }
    return headers, spice, metadata


def probe(evidence, output, check_in, check_out, hotel_id=None):
    headers, spice, metadata = app_identification(evidence)
    output.mkdir(parents=True, exist_ok=True)
    identity_path = evidence / 'diagnostic-client-id.txt'
    if not identity_path.exists():
        identity_path.write_text(uuid.uuid4().hex, encoding='utf-8')
    # A locally generated test client ID, not a real phone or device attestation.
    common = {'user_version': metadata['versionName'] + '-android',
              'languagecode': 'en-gb', 'user_os': '15',
              'device_id': identity_path.read_text(encoding='utf-8').strip(),
              'network_type': 'wifi', 'display': 'normal_xxhdpi'}
    params = {**common, 'currency_code': 'SAR', 'arrival_date': check_in,
              'departure_date': check_out, 'rec_guest_qty': '2',
              'rec_room_qty': '1', 'rec_children_qty': '0'}
    if hotel_id:
        params['hotel_id'] = hotel_id
    # The APK's SearchQueryExtKt supports a latlong search. This is a diagnostic
    # search near central Makkah, not a claim that a particular hotel was matched.
    requests = [('mobile.searchResults', {**params, 'search_type': 'latlong',
                'latitude': '21.42', 'longitude': '39.83', 'radius': '2',
                'guest_qty': '2', 'room_qty': '1', 'children_qty': '0'})]
    if hotel_id:
        hotel_params = {**params, 'detail_level': '1', 'include_taxes': '1',
                        'show_extra_charges': '1', 'include_mealplan': '1',
                        'show_occupancy_for_price': '1', 'include_paymentterms': '1',
                        'include_detail_mealplan': '1', 'include_cancellation_timeline': '1',
                        'include_sleeping_clarity': '1', 'no_html': '1'}
        requests.append(('mobile.hotelPage', hotel_params))
        requests.append(('mobile.roomList', hotel_params))
    results = []
    # The app's search API lives on this host; the secure host returned method-not-found.
    for host in ['mobile-apps.booking.com']:
        for endpoint, query in requests:
            query_string = urllib.parse.urlencode(query)
            url = f'https://{host}/json/{endpoint}?{query_string}'
            request_headers = {**headers, 'B-S': '1,' + hashlib.sha1((query_string + spice).encode()).hexdigest()}
            row = {'host': host, 'endpoint': endpoint, 'query': query,
                   'requestHeaderNames': sorted(request_headers),
                   'querySignatureIncluded': True, 'priceDataVerified': False}
            request = urllib.request.Request(url, headers=request_headers)
            try:
                with urllib.request.urlopen(request, timeout=25) as response:
                    body = response.read(2_000_000)
                    row['httpStatus'] = response.status
                    row['contentType'] = response.headers.get('Content-Type')
                    row['server'] = response.headers.get('Server')
            except urllib.error.HTTPError as error:
                body = error.read(2_000_000)
                row['httpStatus'] = error.code
                row['contentType'] = error.headers.get('Content-Type')
                row['server'] = error.headers.get('Server')
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
            print(json.dumps({k: row.get(k) for k in ['host', 'endpoint', 'httpStatus', 'contentType', 'cloudfrontBlocked', 'networkError']}), flush=True)
            # Do not repeat paths on a host whose edge explicitly blocks access.
            if row['cloudfrontBlocked']:
                break
    report = {'testedAtUtc': datetime.now(timezone.utc).isoformat(),
              'source': 'Booking Android APK static analysis', 'apk': metadata,
              'androidRuntimeUsed': False, 'windowsLocalTestOnly': True,
              'hotelIdRequested': hotel_id, 'hotelIdVerified': False, 'appSessionObtained': False,
              'priceScrapingVerified': False,
              'limitations': ['No live app session or traffic capture',
                              'Minimal requests reconstructed from static code',
                              'Diagnostic client ID and Android profile are synthetic',
                              'No hotel identity or price response verified yet',
                              'No Dokploy server test performed'],
              'requests': results}
    (output / 'probe-result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    return 0 if any(r.get('httpStatus') == 200 and r.get('jsonType') for r in results) else 2


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--evidence', default='outputs/booking-app-probe')
    parser.add_argument('--output', default='outputs/booking-app-probe/live')
    parser.add_argument('--check-in', required=True)
    parser.add_argument('--check-out', required=True)
    parser.add_argument('--hotel-id')
    parser.add_argument('--confirm-app-identification', action='store_true',
                        help='Explicitly enable the user-authorized app identification/signature test')
    args = parser.parse_args()
    if not args.confirm_app_identification:
        parser.error('This authenticated diagnostic is pending explicit user approval; use probe-booking-app.py for the unauthenticated probe')
    for value in [args.check_in, args.check_out]:
        datetime.strptime(value, '%Y-%m-%d')
    if args.check_out <= args.check_in:
        parser.error('check-out must be after check-in')
    if args.hotel_id and not re.fullmatch(r'[1-9]\d*', args.hotel_id):
        parser.error('hotel-id must be a positive numeric Booking hotel identifier')
    raise SystemExit(probe(Path(args.evidence), Path(args.output), args.check_in, args.check_out, args.hotel_id))
