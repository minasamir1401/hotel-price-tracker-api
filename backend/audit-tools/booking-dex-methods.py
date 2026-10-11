"""Locate request construction methods in a DEX inside an APK.

Pass APK, DEX entry, output path, and one or more exact string constants.
Install androguard into outputs/booking-app-probe/tools first.
"""
import json
import re
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path('outputs/booking-app-probe/tools').resolve()))
from loguru import logger
logger.disable('androguard')
from androguard.core.dex import DEX


def inspect(apk, entry, output, targets):
    with zipfile.ZipFile(apk) as archive:
        dex = DEX(archive.read(entry))
    hits = []
    for cls in dex.get_classes():
        for method in cls.get_methods():
            code = method.get_code()
            if code is None:
                continue
            found = []
            instructions = []
            for instruction in method.get_instructions():
                name = instruction.get_name()
                value = instruction.get_output()
                instructions.append(f'{name} {value}')
                if name.startswith('const-string'):
                    literal = value.split(', ', 1)[-1].strip('"')
                    for target in targets:
                        if not target.startswith('class:') and target == literal:
                            found.append(target)
            for target in targets:
                if target.startswith('class:') and re.search(target[6:], cls.get_name()):
                    found.append(target)
            if found:
                hit = {'class': cls.get_name(), 'method': method.get_name(),
                       'descriptor': method.get_descriptor(),
                       'targets': sorted(set(found)), 'instructions': instructions}
                hits.append(hit)
                print(f'{cls.get_name()}->{method.get_name()} :: {hit["targets"]}', flush=True)
    Path(output).write_text(json.dumps(hits, indent=2), encoding='utf-8')


if __name__ == '__main__':
    inspect(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:])
