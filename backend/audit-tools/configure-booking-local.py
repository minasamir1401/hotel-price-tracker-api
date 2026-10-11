"""Provision ignored local server config from the user-authorized APK evidence.

Never prints credentials. Not included in the Docker image.
"""
import importlib.util
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('booking_probe', Path(__file__).with_name('booking-app-auth-pending.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
evidence = root / 'outputs/booking-app-probe'
headers, salt, metadata = module.app_identification(evidence)
values = {
    'BOOKING_APP_AUTHORIZATION': headers['Authorization'],
    'BOOKING_APP_SIGNATURE_SALT': salt,
    'BOOKING_APP_VERSION': metadata['versionName'],
    'BOOKING_APP_DEVICE_ID': (evidence / 'diagnostic-client-id.txt').read_text().strip(),
}
destination = root / 'outputs/booking-app-probe/server.env'
destination.write_text('\n'.join(f'{key}={json.dumps(value)}' for key, value in values.items()) + '\n', encoding='utf-8')
print('Local Booking server configuration saved under ignored outputs; no secrets printed.')
