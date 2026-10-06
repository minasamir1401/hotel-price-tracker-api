import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchDailyPricesAlmatar } from './daily-prices-almatar.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const XLSX = await import('../frontend/node_modules/xlsx/xlsx.mjs');

const HOTEL_URL = 'https://almatar.com/ar/hotels/rooms/mecca-al-marwa-rayhaan-by-rotana-makkah-133550/?checkIn=10%2F01%2F2026&checkOut=10%2F02%2F2026&rooms=2_adult&source=list&freq=&fname=&h_index=0';
const CHECK_IN = '2026-10-01';
const CHECK_OUT = '2026-11-01';
const ADULTS = 2;
const ROOM_NAME = 'غرفة واسعة بسرير توأم';
const ROOM_KEYWORDS = ['غرفة واسعة بسرير توأم'];

async function run() {
  console.log('بدء استخراج أسعار شهر أكتوبر 2026 لفندق المروة ريحان من روتانا...');
  console.log(`الفندق: المروة ريحان من روتانا (133550)`);
  console.log(`الغرفة: ${ROOM_NAME}`);
  console.log(`الفترة: من ${CHECK_IN} إلى ${CHECK_OUT} (31 ليلة)`);
  console.log(`عدد النزلاء: ${ADULTS} بالغين`);

  const startTime = Date.now();
  const data = await fetchDailyPricesAlmatar({
    hotelInput: HOTEL_URL,
    checkIn: CHECK_IN,
    checkOut: CHECK_OUT,
    adults: ADULTS,
    childAges: [],
    roomName: ROOM_NAME,
    roomKeywords: ROOM_KEYWORDS,
    concurrency: 4,
    onProgress: ({ completed, total }) => {
      console.log(`[تقدم الفحص] تم فحص ${completed} من إجمالي ${total} ليلة...`);
    }
  });

  const durationSec = Math.round((Date.now() - startTime) / 1000);
  console.log(`تم جلب جميع الليالي بنجاح في ${durationSec} ثانية.`);

  // Save JSON
  const jsonPath = path.join(__dirname, 'almarwa_october_2026_prices.json');
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`تم حفظ النتائج في: ${jsonPath}`);

  const publicJsonPath = path.join(__dirname, '..', 'frontend', 'public', 'almarwa-october-2026.json');
  fs.writeFileSync(publicJsonPath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`تم تحديث ملف العرض للواجهة: ${publicJsonPath}`);

  // Meal plan definitions
  const mealPlanDefs = [
    { key: 'breakfast', label: 'إقامة وإفطار (غير قابل للإسترداد)' },
    { key: 'breakfastFlexible', label: 'إقامة وإفطار (قابل للإسترداد)' },
    { key: 'halfBoard', label: 'إفطار + غداء أو عشاء (غير قابل للإسترداد)' },
    { key: 'halfBoardFlexible', label: 'إفطار + غداء أو عشاء (قابل للإسترداد)' },
    { key: 'roomOnly', label: 'إقامة فقط (غير قابل للإسترداد)' },
    { key: 'roomOnlyFlexible', label: 'إقامة فقط (قابل للإسترداد)' }
  ];

  const hasPrice = (row, key) => {
    const p = row.offers?.[key]?.price;
    if (p !== undefined && p !== null && !isNaN(Number(p))) return true;
    const val = row[key];
    return val !== null && val !== undefined && val !== 'غير متاح' && val !== '' && !isNaN(Number(val));
  };

  // Only keep columns that have at least one valid price across the month
  const activeMealPlans = mealPlanDefs.filter(plan => data.rows.some(r => hasPrice(r, plan.key)));

  function generateWorkbook(rowsSubset, checkInDate, checkOutDate) {
    const wb = XLSX.utils.book_new();
    const activeForSubset = mealPlanDefs.filter(plan => rowsSubset.some(r => hasPrice(r, plan.key)));
    const exportColumns = [
      { key: 'date', label: 'التاريخ' },
      { key: 'dayName', label: 'اليوم' },
      ...activeForSubset,
      { key: 'dayStatus', label: 'سياسة الإلغاء' }
    ];

    const sheetRows = [
      [`أسعار المطار — ${data.hotelName}`],
      ['الغرفة', data.roomName || ROOM_NAME],
      ['الإشغال', `${ADULTS} بالغين لكل غرفة × 1 غرفة`],
      ['الفترة', `${checkInDate} إلى ${checkOutDate} — كل ليلة باستعلام مستقل`],
      ['وقت الاستعلام (UTC)', data.fetchedAt],
      ['العملة', 'ريال سعودي — السعر لكل غرفة وليلة شامل الضريبة وخصم المصدر'],
      [],
      exportColumns.map(col => col.label),
      ...rowsSubset.map(row => exportColumns.map(col => {
        if (col.key === 'date') return row.date;
        if (col.key === 'dayName') return row.dayName;
        if (col.key === 'dayStatus') {
          const isAvail = activeForSubset.some(p => hasPrice(row, p.key));
          return isAvail ? row.dayStatus : (row.error ? 'تعذر التحقق' : 'غير متاح');
        }
        return row.offers?.[col.key]?.price !== undefined
          ? row.offers[col.key].price
          : (hasPrice(row, col.key) ? parseFloat(row[col.key]) : 'غير متاح');
      }))
    ];

    const ws = XLSX.utils.aoa_to_sheet(sheetRows);
    ws['!cols'] = exportColumns.map(c => ({ wch: c.key === 'dayStatus' ? 30 : 22 }));
    wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, 'أسعار الإقامة');
    return wb;
  }

  // 1. Full October Workbook
  const fullWb = generateWorkbook(data.rows, CHECK_IN, CHECK_OUT);
  const octExcelName = 'فندق المروة ريحان من روتانا - غرفة واسعة بسرير توأم - إقامة وإفطار - شهر 10 (من 2026-10-01 الى 2026-11-01).xlsx';
  const octExcelPath = path.join(__dirname, '..', octExcelName);
  const fullBuf = XLSX.write(fullWb, { type: 'buffer', bookType: 'xlsx' });
  fs.writeFileSync(octExcelPath, fullBuf);
  console.log(`تم تصدير ملف إكسيل أكتوبر بنجاح: ${octExcelPath}`);

  // Overwrite user-referenced file in root
  const userExcelName = 'المروة_ريحان_2026-10-01_2026-11-01 (2).xlsx';
  const userExcelPath = path.join(__dirname, '..', userExcelName);
  fs.writeFileSync(userExcelPath, fullBuf);
  console.log(`تم تحديث ملف المستخدم المرجعي بنجاح: ${userExcelPath}`);

  // 2. Specific 2026-10-05 to 2026-11-05 Workbook
  const subRows = data.rows.filter(r => r.date >= '2026-10-05');
  const subWb = generateWorkbook(subRows, '2026-10-05', '2026-11-05');
  const subExcelName = 'المروة_ريحان_2026-10-05_2026-11-05.xlsx';
  const subExcelPath = path.join(__dirname, '..', subExcelName);
  fs.writeFileSync(subExcelPath, XLSX.write(subWb, { type: 'buffer', bookType: 'xlsx' }));
  console.log(`تم تحديث ملف إكسيل المستخدم بنجاح: ${subExcelPath}`);

  return { data, octExcelName, userExcelName, subExcelName };
}

run().catch(console.error);
