import fs from 'node:fs/promises';
import path from 'node:path';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const dir=path.resolve('outputs/october-2026-live');
for(const id of ['almosafer-naseem-2rooms-2adults-each','almatar-dana-2rooms-2adults-each']) {
  const workbook=await SpreadsheetFile.importXlsx(await FileBlob.load(path.join(dir,`${id}.xlsx`)));
  const preview=await workbook.render({sheetName:'الجدول اليومي (31 ليلة)',range:'A1:J14',scale:1,format:'png'});
  await fs.writeFile(path.join(dir,`${id}-excel-preview.png`),new Uint8Array(await preview.arrayBuffer()));
  console.log('RENDERED',id);
}
