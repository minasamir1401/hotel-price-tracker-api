from pathlib import Path
import json, zipfile

root = Path('outputs/october-2026-live').resolve()
report = json.loads((root/'report.json').read_text(encoding='utf-8'))
shared = ['ACCEPTANCE.md','report.json','manifest.json','workbook-checksums.json','http-occupancy-tests.json','app-occupancy-verified.png','app-almatar-two-rooms.png','almatar-source-two-rooms.png','almatar-source-two-rooms.txt','almosafer-naseem-2rooms-2adults-each-excel-preview.png','almatar-dana-2rooms-2adults-each-excel-preview.png']
for name, evidence in [('october-2026-prices.zip',False),('october-2026-evidence.zip',True)]:
    target=root.parent/name
    with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
        for item in shared:
            file=root/item
            if file.exists():archive.write(file,item)
        for case in report['cases']:
            archive.write(root/(case['id']+'.xlsx'),case['id']+'.xlsx')
            for file in (root/case['id']).iterdir():
                if file.is_file() and (evidence or file.suffix=='.xlsx'):
                    archive.write(file,file.relative_to(root).as_posix())
    with zipfile.ZipFile(target) as archive:
        assert archive.testzip() is None
        xlsx=[f for f in archive.namelist() if f.endswith('.xlsx')]
        assert len(xlsx)==235
        print(name,len(archive.namelist()),'files',len(xlsx),'workbooks',target.stat().st_size,'bytes',flush=True)
