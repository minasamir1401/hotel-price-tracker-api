"""Save selected DEX methods/Retrofit annotations locally; never run app code."""
import argparse
import json
import re
import struct
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'outputs/booking-app-probe/tools'))
from loguru import logger
logger.disable('androguard')
from androguard.core.dex import DEX

parser = argparse.ArgumentParser()
parser.add_argument('apk')
parser.add_argument('entry')
parser.add_argument('output')
parser.add_argument('classes')
parser.add_argument('--methods', default='.*')
parser.add_argument('--calls', default=None)
args = parser.parse_args()
with zipfile.ZipFile(args.apk) as archive:
    raw = archive.read(args.entry)
dex = DEX(raw)
strings = list(dex.get_strings())

def uleb(pos):
    value = 0
    for shift in range(0, 35, 7):
        byte = raw[pos]
        pos += 1
        value |= (byte & 127) << shift
        if not byte & 128:
            return value, pos
    raise ValueError('Invalid uleb')

def encoded_value(pos):
    byte = raw[pos]
    pos += 1
    kind, count = byte & 31, (byte >> 5) + 1
    if kind == 28:
        size, pos = uleb(pos)
        values = []
        for _ in range(size):
            value, pos = encoded_value(pos)
            values.append(value)
        return values, pos
    if kind == 29:
        return annotation(pos)
    if kind == 30:
        return None, pos
    if kind == 31:
        return bool(byte >> 5), pos
    index = int.from_bytes(raw[pos:pos+count], 'little')
    pos += count
    if kind == 23:
        return strings[index], pos
    if kind == 24:
        return dex.get_cm_type(index), pos
    return index, pos

def annotation(pos):
    index, pos = uleb(pos)
    size, pos = uleb(pos)
    values = {}
    for _ in range(size):
        name, pos = uleb(pos)
        value, pos = encoded_value(pos)
        values[strings[name]] = value
    return {'type': dex.get_cm_type(index), 'values': values}, pos

def annotation_set(pos):
    if not pos:
        return []
    size = struct.unpack_from('<I', raw, pos)[0]
    return [annotation(struct.unpack_from('<I', raw, pos+4+i*4)[0]+1)[0]
            for i in range(size)]

result = []
for cls in dex.get_classes():
    if not re.search(args.classes, cls.get_name()):
        continue
    item = {'class': cls.get_name(), 'fields': [], 'methods': []}
    annotations = {}
    field_annotations = {}
    offset = cls.get_annotations_off()
    if offset:
        _, fields, methods, _ = struct.unpack_from('<4I', raw, offset)
        for i in range(fields):
            index, at = struct.unpack_from('<II', raw, offset+16+i*8)
            field_annotations[index] = annotation_set(at)
        for i in range(methods):
            index, at = struct.unpack_from('<II', raw, offset+16+fields*8+i*8)
            annotations[index] = annotation_set(at)
    for field in cls.get_fields():
        item['fields'].append({'name': field.get_name(), 'type':field.get_descriptor(),
                               'annotations':field_annotations.get(field.get_field_idx(), [])})
    for method in cls.get_methods():
        if not re.search(args.methods, method.get_name()):
            continue
        entry = {'method':method.get_name(), 'descriptor':method.get_descriptor(),
                 'annotations':annotations.get(method.get_method_idx(), [])}
        if method.get_code():
            entry['instructions'] = [i.get_name()+' '+i.get_output() for i in method.get_instructions()]
        if args.calls and not any(re.search(args.calls, line) for line in entry.get('instructions', [])):
            continue
        item['methods'].append(entry)
    if not args.calls or item['methods']:
        result.append(item)
Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'entry':args.entry, 'classes':len(result),
                  'methods':sum(len(x['methods']) for x in result), 'saved':args.output}))
