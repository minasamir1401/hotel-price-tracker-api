import fs from 'fs';
import path from 'path';

const XLSX = await import('../frontend/node_modules/xlsx/xlsx.mjs');

const hotelId = '1798852';
const apiToken = '4R!eVj7$&7Q8Duhv1#pB';
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'Origin': 'https://www.almosafer.com',
  'token': apiToken,
  'x-authorization': apiToken,
  'x-api-key': 'apikey-hotel',
  'x-app-name': 'ct-web-hotels-app',
  'x-bt': 'next',
  'x-currency': 'SAR',
  'x-locale': 'ar'
};

const dayNamesArabic = {
  0: 'الأحد',
  1: 'الإثنين',
  2: 'الثلاثاء',
  3: 'الأربعاء',
  4: 'الخميس',
  5: 'الجمعة',
  6: 'السبت'
};

async function fetchDayPrice(checkInStr, checkOutStr) {
  try {
    const payload = {
      checkIn: checkInStr,
      checkOut: checkOutStr,
      roomsInfo: [{ adultsCount: 2, kidsAges: [] }],
      hotelId,
      currency: 'SAR'
    };

    const initRes = await fetch('https://www.almosafer.com/api/enigma/v7/packages', {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload)
    });

    const init = await initRes.json();
    if (!init.pId || init.pId.startsWith('no-pkg')) {
      return {
        date: checkInStr,
        nextDate: checkOutStr,
        ro: 'مكتمل الحجز',
        bb: 'مكتمل الحجز',
        hb: 'مكتمل الحجز',
        cancel: 'غير متاح',
        isAvailable: false
      };
    }

    const delay = Math.max(1500, init.initialDelayInMillis || 2000);
    await new Promise(r => setTimeout(r, delay));

    for (let attempt = 1; attempt <= 6; attempt++) {
      const pollRes = await fetch(`https://www.almosafer.com/api/enigma/v7/packages/poll/${init.pId}`, { headers });
      const poll = await pollRes.json();

      const groups = poll.packagesGroups || [];
      const standardGroup = groups.find(g =>
        (g.title?.ar || '').includes('ستاندرد') || (g.title?.en || '').toLowerCase().includes('standard')
      );

      const packages = (standardGroup ? standardGroup.packages : (poll.packages || []));
      const twinPackages = packages.filter(p => {
        const bed = p.rooms?.[0]?.rmsDetail?.locale?.ar?.bedding || '';
        return bed.includes('٢ سرير فردي') || bed.includes('2 Twin');
      });

      if (twinPackages.length > 0) {
        const roPkg = twinPackages.find(p => p.rooms[0]?.roomBasis === 'RO');
        const bbPkg = twinPackages.find(p => p.rooms[0]?.roomBasis === 'BB');
        const hbPkg = twinPackages.find(p => p.rooms[0]?.roomBasis === 'HB');

        const ro = roPkg?.packageRateInfo?.total;
        const bb = bbPkg?.packageRateInfo?.total;
        const hb = hbPkg?.packageRateInfo?.total;

        const cancel = twinPackages[0]?.cancellationPolicy?.hasFreeCancellation
          ? 'إلغاء مجاني'
          : 'غير مسترد';

        return {
          date: checkInStr,
          nextDate: checkOutStr,
          ro: ro ? Math.round(ro) : null,
          bb: bb ? Math.round(bb) : null,
          hb: hb ? Math.round(hb) : null,
          cancel,
          isAvailable: true
        };
      }

      if (poll.pollingStatus === 'COMPLETED_SUCCESSFULLY' && attempt >= 3) {
        break;
      }
      await new Promise(r => setTimeout(r, 1500));
    }
  } catch (e) {
    console.error(`Error on date ${checkInStr}:`, e.message);
  }

  return {
    date: checkInStr,
    nextDate: checkOutStr,
    ro: 'غير متوفر',
    bb: 'غير متوفر',
    hb: 'غير متوفر',
    cancel: 'غير متوفر',
    isAvailable: false
  };
}

async function run() {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 1);
  startDate.setUTCHours(12, 0, 0, 0);
  const totalDays = 10;
  const datePairs = [];

  for (let i = 0; i < totalDays; i++) {
    const d1 = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    const d2 = new Date(startDate.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
    const s1 = d1.toISOString().split('T')[0];
    const s2 = d2.toISOString().split('T')[0];
    const dayOfWeek = dayNamesArabic[d1.getUTCDay()];
    datePairs.push({ index: i + 1, s1, s2, dayOfWeek });
  }

  console.log(`Starting live scrape for 10 days starting 2026-09-29...`);
  const finalResults = [];

  for (let i = 0; i < datePairs.length; i += 2) {
    const chunk = datePairs.slice(i, i + 2);
    const chunkRes = await Promise.all(chunk.map(d => fetchDayPrice(d.s1, d.s2)));
    for (let j = 0; j < chunk.length; j++) {
      const meta = chunk[j];
      const data = chunkRes[j];
      finalResults.push({
        index: meta.index,
        dayOfWeek: meta.dayOfWeek,
        date: meta.s1,
        ro: data.ro,
        bb: data.bb,
        hb: data.hb,
        cancel: data.cancel,
        isAvailable: data.isAvailable
      });
      console.log(`Night ${meta.index} (${meta.dayOfWeek} ${meta.s1}): RO=${data.ro}, BB=${data.bb}, HB=${data.hb}`);
    }
  }

  // Build Excel Workbook
  const excelRows = [
    ['تقرير أسعار غرفة ستاندرد - ٢ سرير فردي (شخصين) - المسافر - 10 أيام'],
    ['فندق ميلينيوم مكة النسيم'],
    ['تاريخ الاستخراج: ' + new Date().toISOString().replace('T', ' ').slice(0, 19)],
    [],
    ['م', 'اليوم', 'التاريخ', 'إقامة فقط (ر.س)', 'إقامة وإفطار (ر.س)', 'نصف إقامة - وجبتين (ر.س)', 'سياسة الإلغاء']
  ];

  for (const item of finalResults) {
    excelRows.push([
      item.index,
      item.dayOfWeek,
      item.date,
      item.ro,
      item.bb,
      item.hb,
      item.cancel
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(excelRows);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 12 },
    { wch: 15 },
    { wch: 22 },
    { wch: 22 },
    { wch: 26 },
    { wch: 16 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'الأسعار اليومية 10 أيام');

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
  const outPath = path.resolve('..', 'اسعار_غرفة_ستاندرد_٢_سرير_فردي_10_ايام.xlsx');
  fs.writeFileSync(outPath, buf);

  console.log(`\nExcel file successfully saved at: ${outPath}`);
}

run();
