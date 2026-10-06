import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const XLSX = await import('../frontend/node_modules/xlsx/xlsx.mjs');

const jsonPath = path.join(__dirname, 'almarwa_october_2026_prices.json');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const wb = XLSX.utils.book_new();

const titleRows = [
  ['تقرير أسعار فندق المروة ريحان من روتانا - مكة المكرمة'],
  ['المصدر: المطار (almatar.com)'],
  ['نوع الغرفة: غرفة واسعة بسرير توأم'],
  ['النزلاء: 2 أفراد (بالغين) | الوجبة المطلوبة: إقامة وإفطار'],
  [`فترة الإقامة: شهر أكتوبر 2026 بالكامل (من ${data.checkIn} إلى ${data.checkOut} - ${data.nights} ليلة)`],
  ['العملة: ريال سعودي (SAR)'],
  [],
  [
    'م',
    'اليوم',
    'التاريخ',
    'إقامة فقط (ر.س)',
    'إقامة وإفطار (ر.س)',
    'إقامة وإفطار - مرن / إلغاء مجاني (ر.س)',
    'إفطار + غداء أو عشاء (ر.س)',
    'فرق سعر الفطور (ر.س)',
    'حالة الإلغاء والتوفر'
  ]
];

let totalBreakfast = 0;
let breakfastCount = 0;
let totalRoomOnly = 0;
let roomOnlyCount = 0;
let totalHalfBoard = 0;
let halfBoardCount = 0;
let totalBreakfastFlex = 0;
let breakfastFlexCount = 0;

const dataRows = data.rows.map(r => {
  const bb = parseFloat(r.breakfast);
  if (!isNaN(bb)) {
    totalBreakfast += bb;
    breakfastCount++;
  }
  const ro = parseFloat(r.roomOnly);
  if (!isNaN(ro)) {
    totalRoomOnly += ro;
    roomOnlyCount++;
  }
  const hb = parseFloat(r.halfBoard);
  if (!isNaN(hb)) {
    totalHalfBoard += hb;
    halfBoardCount++;
  }
  const bbFl = parseFloat(r.breakfastFlexible);
  if (!isNaN(bbFl)) {
    totalBreakfastFlex += bbFl;
    breakfastFlexCount++;
  }

  return [
    r.rowIndex,
    r.dayName,
    r.date,
    r.roomOnly !== 'غير متاح' ? parseFloat(r.roomOnly) : 'غير متاح',
    r.breakfast !== 'غير متاح' ? parseFloat(r.breakfast) : 'غير متاح',
    r.breakfastFlexible !== 'غير متاح' ? parseFloat(r.breakfastFlexible) : 'غير متاح',
    r.halfBoard !== 'غير متاح' ? parseFloat(r.halfBoard) : 'غير متاح',
    r.breakfastDiff !== 'غير متاح' ? parseFloat(r.breakfastDiff) : '—',
    r.dayStatus
  ];
});

const avgBreakfast = breakfastCount > 0 ? (totalBreakfast / breakfastCount).toFixed(2) : '—';
const summaryRows = [
  [],
  [
    'الإجمالي',
    `${data.nights} ليلة`,
    `متاح ${breakfastCount}/${data.nights}`,
    roomOnlyCount > 0 ? totalRoomOnly : '—',
    breakfastCount > 0 ? totalBreakfast : '—',
    breakfastFlexCount > 0 ? totalBreakfastFlex : '—',
    halfBoardCount > 0 ? totalHalfBoard : '—',
    '—',
    breakfastCount === data.nights ? 'متاح طوال الشهر' : `متاح في ${breakfastCount} ليلة`
  ],
  [
    'متوسط الليلة',
    '—',
    '—',
    roomOnlyCount > 0 ? (totalRoomOnly / roomOnlyCount).toFixed(2) : '—',
    avgBreakfast,
    breakfastFlexCount > 0 ? (totalBreakfastFlex / breakfastFlexCount).toFixed(2) : '—',
    halfBoardCount > 0 ? (totalHalfBoard / halfBoardCount).toFixed(2) : '—',
    '—',
    'ريال سعودي / ليلة'
  ]
];

const ws = XLSX.utils.aoa_to_sheet([...titleRows, ...dataRows, ...summaryRows]);

ws['!cols'] = [
  { wch: 6 },
  { wch: 12 },
  { wch: 14 },
  { wch: 18 },
  { wch: 20 },
  { wch: 32 },
  { wch: 24 },
  { wch: 18 },
  { wch: 22 }
];
ws['!views'] = [{ RTL: true }];

XLSX.utils.book_append_sheet(wb, ws, 'أسعار أكتوبر 2026');

const excelFileName = 'فندق المروة ريحان من روتانا - غرفة واسعة بسرير توأم - إقامة وإفطار - شهر 10 (من 2026-10-01 الى 2026-11-01).xlsx';
const excelPath = path.join(__dirname, '..', excelFileName);

const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
fs.writeFileSync(excelPath, buf);
console.log(`تم إنشاء ملف الإكسيل بنجاح: ${excelPath}`);
console.log(`حجم الملف: ${buf.length} بايت`);
