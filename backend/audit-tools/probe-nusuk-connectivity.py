"""Bounded read-only connectivity checks for APK-confirmed Nusuk services.

No login attempt, Android runtime, reservation, cart, or payment request.
Raw responses stay in ignored outputs and are never printed.
"""
import json
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'outputs/nusuk-app-probe/connectivity'
OUT.mkdir(parents=True, exist_ok=True)
headers = {
    'User-Agent': 'okhttp/5.3.0',
    'Accept': 'application/json', 'Content-Type': 'application/json',
    'Accept-Language': 'ar', 'Content-Language': 'ar',
    'Platform': 'android', 'version': '7.0.0', 'Brand': '1',
    'POS': 'SA', 'x-flow': 'B2C',
}
checks = [
    ('sdk-hotel', 'https://apiout.almatar.com/api/almtaar/hotelbyprofilekey/mecca-m-hotel-al-dana-makkah-millennium-1660326'),
    ('nusuk-sdk-token', 'https://nusukapp.nusuk.sa/nusuk/almatar/generateToken'),
]
results = []
for name, url in checks:
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            status, content_type, raw = response.status, response.headers.get('Content-Type'), response.read()
    except urllib.error.HTTPError as error:
        status, content_type, raw = error.code, error.headers.get('Content-Type'), error.read()
    except (urllib.error.URLError, TimeoutError) as error:
        results.append({'name':name, 'status':None, 'error':str(error.reason) if hasattr(error,'reason') else type(error).__name__})
        print(json.dumps(results[-1]), flush=True)
        continue
    (OUT / (name + '.body')).write_bytes(raw)
    item = {'name':name, 'status':status, 'contentType':content_type, 'bytes':len(raw)}
    try:
        data = json.loads(raw)
        item['jsonKeys'] = list(data) if isinstance(data,dict) else None
        if name == 'sdk-hotel':
            item['hotelId'] = data.get('data',{}).get('almHotelCode') if isinstance(data.get('data'),dict) else None
    except (ValueError, AttributeError):
        item['responseKind'] = 'html' if b'<html' in raw.lower() else 'non-json'
    results.append(item)
    print(json.dumps(item), flush=True)
(OUT / 'result.json').write_text(json.dumps({
    'testedAtUtc':datetime.now(timezone.utc).isoformat(),
    'authorizationSent':False, 'emulatorUsed':False, 'pricesVerified':False,
    'checks':results,
},indent=2),encoding='utf-8')
