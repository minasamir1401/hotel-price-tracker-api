"""Fetch one hotel/night using request schema and headers found in Nusuk's SDK.

This is a guest SDK diagnostic, not proof of a signed-in Nusuk screen price.
It never creates carts, reservations, orders, or payments.
"""
import json
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'outputs/nusuk-app-probe/guest-one-night'
OUT.mkdir(parents=True, exist_ok=True)
headers = {
    'User-Agent':'okhttp/5.3.0', 'Accept':'application/json',
    'Content-Type':'application/json', 'Accept-Language':'ar',
    'Content-Language':'ar', 'Platform':'android', 'version':'7.0.0',
    'Brand':'1', 'POS':'SA', 'x-flow':'B2C',
}
request_data = {
    'hotelId':1660326, 'multiRoomMode':True, 'countryCode':'SA',
    'req':{'cy':'SAR', 'fd':'10/20/2026', 'td':'10/21/2026',
           'rs':[{'ac':2,'cc':0,'ka':[]}]},
}
paths = ['/api/hotel/v5/rooms/getpackages/search_with_hotel']
evidence = {'testedAtUtc':datetime.now(timezone.utc).isoformat(),
            'apkPackage':'com.moh.nusukapp', 'apkVersion':'17.5.4',
            'apiHost':'apiout.almatar.com', 'nativeRequest':request_data,
            'signedInNusukSession':False, 'screenPriceVerified':False,
            'emulatorUsed':False, 'packets':[]}
for index in range(4):
    path = paths[-1]
    body = request_data if index == 0 else poll_data
    req = urllib.request.Request('https://apiout.almatar.com'+path,
        data=json.dumps(body).encode(), headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=35) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read()
    (OUT / f'packet-{index}.json').write_bytes(raw)
    packet = json.loads(raw)
    data = packet.get('data') or {}
    item = {'index':index, 'httpStatus':status, 'bytes':len(raw),
            'keys':list(packet), 'dataKeys':list(data) if isinstance(data,dict) else None,
            'isSearchCompleted':data.get('isSearchCompleted'),
            'groups':len(data.get('searchRoomsResults') or []),
            'requestPath':path}
    evidence['packets'].append(item)
    print(json.dumps(item),flush=True)
    if status != 200 or not isinstance(data, dict):
        break
    if data.get('isSearchCompleted') is True:
        break
    session = data.get('sd')
    if not session:
        break
    poll_data = {'almHotelId':request_data['hotelId'], 'queueSessionId':session}
    paths.append('/api/hotel/v4/rooms/getpackages/search_with_session_id')
    time.sleep(0.5)
(OUT / 'request-evidence.json').write_text(json.dumps(evidence,indent=2),encoding='utf-8')
