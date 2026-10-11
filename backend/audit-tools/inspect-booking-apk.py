"""Read a Booking APK as data; never install or execute Android code.

Usage: python backend/audit-tools/inspect-booking-apk.py PATH_TO_APK OUTPUT_DIR
The string inventory is investigation evidence, not a working scraper.
"""
import hashlib
import json
import re
import struct
import sys
import zipfile
from pathlib import Path


def dex_strings(data):
    if not data.startswith(b"dex\n"):
        return []
    count, offset = struct.unpack_from("<II", data, 56)
    result = []
    for i in range(count):
        pos = struct.unpack_from("<I", data, offset + 4 * i)[0]
        while data[pos] & 0x80:
            pos += 1
        pos += 1
        end = data.index(b"\0", pos)
        result.append(data[pos:end].decode("utf-8", errors="replace"))
    return result


def inspect(apk_path, output):
    output.mkdir(parents=True, exist_ok=True)
    with apk_path.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
    evidence = {"file": apk_path.name, "bytes": apk_path.stat().st_size,
                "sha256": digest, "dex": [], "urls": [], "networkStrings": []}
    urls = set()
    relevant = {}
    pattern = re.compile(
        r"booking\.com|distribution|mobile-apps|bookings\.|"
        r"(?:^|[./_])(?:graphql|availability|authentication|authorization|"
        r"registerdevice|register_device|api_version|api_key|user_agent|"
        r"device_id|access_token|session_id)(?:$|[./_])", re.I)
    with zipfile.ZipFile(apk_path) as archive:
        evidence["dex"] = [n for n in archive.namelist() if re.fullmatch(r"classes\d*\.dex", n)]
        evidence["nativeLibraries"] = [n for n in archive.namelist() if n.endswith(".so")]
        for name in evidence["dex"]:
            strings = dex_strings(archive.read(name))
            matches = []
            for value in strings:
                if len(value) < 1000 and pattern.search(value):
                    matches.append(value)
                if value.startswith(("http://", "https://")) and "booking.com" in value:
                    urls.add(value)
            relevant[name] = matches
            print(f"{name}: {len(strings)} strings; {len(matches)} network candidates", flush=True)
    evidence["urls"] = sorted(urls)
    evidence["networkStrings"] = relevant
    (output / "apk-inventory.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
    tools_dir = output / 'tools'
    if (tools_dir / 'androguard').is_dir():
        sys.path.insert(0, str(tools_dir.resolve()))
        from loguru import logger
        logger.disable('androguard')
        from androguard.core.apk import APK
        apk = APK(str(apk_path))
        metadata = {
            'package': apk.get_package(),
            'versionName': apk.get_androidversion_name(),
            'versionCode': apk.get_androidversion_code(),
            'minSdk': apk.get_min_sdk_version(),
            'targetSdk': apk.get_target_sdk_version(),
            'signedV1': apk.is_signed_v1(),
            'signedV2': apk.is_signed_v2(),
            'signedV3': apk.is_signed_v3(),
            'signerCertificateSha256': [hashlib.sha256(c.dump()).hexdigest() for c in apk.get_certificates()],
            'sha256': digest,
            'signingCertificateParsedOnly': True,
            'publisherIdentityIndependentlyVerified': False,
        }
        (output / 'apk-metadata.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')
    print(json.dumps({k: evidence[k] for k in ["file", "bytes", "sha256", "dex"]}))
    for url in sorted(urls):
        if len(url) < 250 and "?" not in url and re.match(r'https?://[^/]+(?:/?|/json/[\w.]+)$', url):
            print(url)


if __name__ == "__main__":
    inspect(Path(sys.argv[1]), Path(sys.argv[2]))
