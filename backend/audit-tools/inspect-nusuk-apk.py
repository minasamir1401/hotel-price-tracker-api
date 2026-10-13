"""Inspect Nusuk APK/XAPK files as data, without installing Android code.

Usage: python backend/audit-tools/inspect-nusuk-apk.py ARCHIVE OUTPUT_DIR
Evidence is an inventory, not proof of live access or verified prices.
"""
import hashlib
import io
import json
import re
import struct
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / "outputs/booking-app-probe/tools"
EXPECTED_PACKAGE = "com.moh.nusukapp"
MAX_ENTRY = 350 * 1024 * 1024


def dex_strings(data):
    if not data.startswith(b"dex\n") or len(data) < 112:
        return []
    count, offset = struct.unpack_from("<II", data, 56)
    if count > 5_000_000 or offset + count * 4 > len(data):
        raise ValueError("Invalid DEX string table")
    strings = []
    for index in range(count):
        pos = struct.unpack_from("<I", data, offset + index * 4)[0]
        for _ in range(5):
            value = data[pos]
            pos += 1
            if not value & 128:
                break
        end = data.find(b"\0", pos)
        if end == -1:
            raise ValueError("Unterminated DEX string")
        strings.append(data[pos:end].decode("utf-8", errors="replace"))
    return strings


def inspect(path, output):
    output.mkdir(parents=True, exist_ok=True)
    if not zipfile.is_zipfile(path):
        raise ValueError("Download is not an APK/XAPK ZIP archive")
    with path.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
    evidence = {
        "inspectedAt": datetime.now(timezone.utc).isoformat(),
        "file": path.name, "bytes": path.stat().st_size,
        "sha256": digest,
        "expectedPackage": EXPECTED_PACKAGE,
        "androidCodeExecuted": False, "emulatorUsed": False,
        "livePricesVerified": False,
        "publisherIdentityIndependentlyVerified": False,
        "apks": [],
    }
    pattern = re.compile(
        r"nusuk|eatamrna|sejel|haj\.gov|hotel|accommodation|roomrate|"
        r"roomlist|availability|booking|baseurl|base_url|certificatepinner|"
        r"attestation|playintegrity|integritytoken|webview|access_token|"
        r"authorization|refresh_token|login|gateway", re.I)
    if TOOLS.is_dir():
        sys.path.insert(0, str(TOOLS))
        from loguru import logger
        logger.disable("androguard")
        from androguard.core.apk import APK
    else:
        APK = None

    def inspect_apk(data, name):
        item = {"file": name, "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest()}
        if APK:
            apk = APK(data, raw=True)
            item.update({
                "package": apk.get_package(),
                "versionName": apk.get_androidversion_name(),
                "versionCode": apk.get_androidversion_code(),
                "matchesRequestedPackage": apk.get_package() == EXPECTED_PACKAGE,
                "signerCertificateSha256": [hashlib.sha256(c.dump()).hexdigest()
                                            for c in apk.get_certificates()],
            })
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            item["dex"] = []
            item["nativeLibraries"] = [n for n in archive.namelist() if n.endswith(".so")]
            item["webAssets"] = [n for n in archive.namelist()
                                 if n.endswith((".js", ".html", "AssetManifest.json", ".bundle"))]
            item["binaryStringEntries"] = []
            matches = {}
            class_index = {}
            urls = set()
            for entry in archive.infolist():
                if entry.file_size > MAX_ENTRY:
                    continue
                if re.fullmatch(r"classes\d*\.dex", entry.filename):
                    item["dex"].append(entry.filename)
                    dex_data = archive.read(entry)
                    strings = dex_strings(dex_data)
                    _, type_offset = struct.unpack_from("<II", dex_data, 64)
                    class_count, class_offset = struct.unpack_from("<II", dex_data, 96)
                    class_index[entry.filename] = [strings[struct.unpack_from(
                        "<I", dex_data, type_offset + 4 * struct.unpack_from(
                            "<I", dex_data, class_offset + 32 * i)[0])[0]]
                        for i in range(class_count)]
                    matches[entry.filename] = [s for s in strings
                                               if len(s) < 2000 and pattern.search(s)]
                    urls.update(s for s in strings if s.startswith(("https://", "http://"))
                                and len(s) < 2000)
                elif entry.filename.endswith((".js", ".html", ".bundle")):
                    content = archive.read(entry).decode("utf-8", errors="replace")
                    urls.update(re.findall(r'https?://[^\s\"\'<>]{3,500}', content))
                    matches[entry.filename] = [content[max(0, m.start()-100):m.end()+250]
                                               for m in pattern.finditer(content)]
                elif entry.filename.endswith("/libapp.so"):
                    # Dart AOT libraries are read as bytes; no native code is run.
                    item["binaryStringEntries"].append(entry.filename)
                    strings = [s.decode("ascii") for s in
                               re.findall(rb"[\x20-\x7e]{8,2000}", archive.read(entry))]
                    matches[entry.filename] = [s for s in strings if pattern.search(s)]
                    urls.update(u for s in strings for u in
                                re.findall(r'https?://[^\s\"\'<>]{3,500}', s))
            item["urls"] = sorted(urls)
            safe_name = re.sub(r"[^a-zA-Z0-9_.-]", "_", name)
            (output / (safe_name + ".strings.json")).write_text(
                json.dumps(matches, ensure_ascii=False, indent=2), encoding="utf-8")
            (output / (safe_name + ".classes.json")).write_text(
                json.dumps(class_index, indent=2), encoding="utf-8")
        evidence["apks"].append(item)
        print(json.dumps({k: item.get(k) for k in
                          ["file", "package", "versionName", "matchesRequestedPackage", "dex"]}))

    with zipfile.ZipFile(path) as archive:
        if "AndroidManifest.xml" in archive.namelist():
            inspect_apk(path.read_bytes(), path.name)
        else:
            if "manifest.json" in archive.namelist():
                evidence["bundleManifest"] = json.loads(archive.read("manifest.json"))
            for entry in archive.infolist():
                if entry.filename.endswith(".apk") and entry.file_size <= MAX_ENTRY:
                    inspect_apk(archive.read(entry), entry.filename)
    if not evidence["apks"]:
        raise ValueError("No APK found in archive")
    (output / "apk-inventory.json").write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Inventory saved; live prices have not been verified.")


if __name__ == "__main__":
    inspect(Path(sys.argv[1]), Path(sys.argv[2]))
