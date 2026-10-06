import path from 'path';
import fs from 'fs';
import { executeHotelComparison } from './scrapers/index.js';

const XLSX = await import('../frontend/node_modules/xlsx/xlsx.mjs');

async function exportVerifiedExcel() {
  const searchParams = {
    hotelInput: 'فندق ميلينيوم مكة النسيم',
    roomNotes: 'غرفة ستاندرد توأم',
    checkIn: '2026-09-29',
    checkOut: '2026-10-11',
    adults: 2,
    children: 0,
    rooms: 1,
    sources: ['almosafer', 'almatar'],
  };

  console.log('Fetching live comparison data from Almosafer and Almatar...');
  const response = await executeHotelComparison(searchParams);
  if (!response.success || !response.data) {
    console.error('Failed to get comparison data');
    process.exit(1);
  }

  const { data: results, summary } = response;
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toLocaleTimeString('ar-SA');

  const workbook = XLSX.utils.book_new();

  // --- Sheet 1: دليل الغرف والوجبات ---
  const sheet1Data = [
    ['تقرير أسعار الغرف وخطط الوجبات الفندقية - Hotel Rooms & Meal Plans Report'],
    ['تاريخ ووقت التصدير:', `${dateStr} ${timeStr}`],
    [],
    ['=== بيانات الاستعلام والبحث ==='],
    ['اسم الفندق', searchParams.hotelInput],
    ['نوع الغرفة المطلوبة', searchParams.roomNotes],
    ['سعة الأفراد', `${searchParams.adults} أفراد (فردين)`],
    ['عدد الغرف', searchParams.rooms],
    ['تاريخ الوصول (Check-in)', searchParams.checkIn],
    ['تاريخ المغادرة (Check-out)', searchParams.checkOut],
    ['مدة الإقامة الكاملة', `${summary.nights} ليلة`],
    ['العملة المعتمدة', 'ريال سعودي (SAR / ر.س)'],
    [],
    ['المصدر', 'اسم الفندق', 'اسم الغرفة', 'نوع الغرفة', 'سعة الأفراد', 'الليالي', 'سعر إقامة فقط (ر.س/ليلة)', 'سعر إقامة وفطور (ر.س/ليلة)', 'سعر إقامة ووجبتين (ر.س/ليلة)', 'تكلفة الفطور للغرفة (ر.س/ليلة)', 'تكلفة الفطور للفرد (ر.س/ليلة)', 'تكلفة الوجبتين للغرفة (ر.س/ليلة)', 'تكلفة الوجبتين للفرد (ر.س/ليلة)', 'العملة', 'سياسة الإلغاء', 'رابط الحجز المباشر']
  ];

  results.forEach(r => {
    const occ = r.capacityAdults || 2;
    const ro = r.roomOnlyPricePerNight || 0;
    const bb = r.breakfastPricePerNight || 0;
    const hb = r.halfBoardPricePerNight || 0;
    const bDiff = Math.max(0, bb - ro);
    const hbDiff = Math.max(0, hb - ro);
    sheet1Data.push([
      r.sourceArabic || r.source,
      r.hotelName,
      r.roomName,
      r.roomCategory || r.roomType,
      r.capacityText,
      r.nights,
      ro,
      bb,
      hb,
      bDiff,
      Math.round((bDiff / occ) * 100) / 100,
      hbDiff,
      Math.round((hbDiff / occ) * 100) / 100,
      'ر.س',
      r.cancellationPolicy || 'إلغاء مجاني',
      r.bookingUrl || ''
    ]);
  });

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
  XLSX.utils.book_append_sheet(workbook, ws1, 'دليل الغرف والوجبات');

  // --- Sheet 2: جدول التوزيع اليومي الكامل ---
  const breakdown = summary.dailyBreakdown || [];
  const sheet2Data = [
    ['جدول التوزيع اليومي الكامل لأسعار ليالي الحجز وخطط الوجبات - Daily Rates Breakdown'],
    ['تاريخ ووقت التصدير:', `${dateStr} ${timeStr}`],
    [],
    ['=== بيانات الاستعلام والحجز ==='],
    ['اسم الفندق المستعلم عنه', searchParams.hotelInput],
    ['فترة الإقامة', `${searchParams.checkIn} إلى ${searchParams.checkOut} (${summary.nights} ليلة)`],
    ['الغرفة المختارة', summary.almosaferRoom || 'غرفة ستاندرد - ٢ سرير فردي'],
    [],
    [
      'رقم اليوم',
      'اليوم',
      'التاريخ',
      'سعة الأفراد',
      'المسافر: إقامة فقط (ر.س/ليلة)',
      'المسافر: إقامة وفطور (ر.س/ليلة)',
      'المسافر: إقامة ووجبتين (ر.س/ليلة)',
      'المسافر: تكلفة الفطور للغرفة (ر.س/ليلة)',
      'المسافر: تكلفة الفطور للفرد (ر.س/ليلة)',
      'المسافر: تكلفة الوجبتين للغرفة (ر.س/ليلة)',
      'المسافر: تكلفة الوجبتين للفرد (ر.س/ليلة)',
      'المسافر: سياسة الإلغاء',
      'المطار: إقامة فقط (ر.س/ليلة)',
      'المطار: إقامة وفطور (ر.س/ليلة)',
      'المطار: إقامة ووجبتين (ر.س/ليلة)',
      'المطار: تكلفة الفطور للغرفة (ر.س/ليلة)',
      'المطار: تكلفة الفطور للفرد (ر.س/ليلة)',
      'المطار: تكلفة الوجبتين للغرفة (ر.س/ليلة)',
      'المطار: تكلفة الوجبتين للفرد (ر.س/ليلة)',
      'المطار: سياسة الإلغاء',
      'طبيعة اليوم'
    ]
  ];

  let sumAlmRO = 0, sumAlmBB = 0, sumAlmHB = 0;
  let sumMatRO = 0, sumMatBB = 0, sumMatHB = 0;

  breakdown.forEach(d => {
    const almRO = d.almosaferRoomOnly ?? 0;
    const almBB = d.almosaferBreakfast ?? 0;
    const almHB = d.almosaferHalfBoard ?? 0;
    const almBDiff = Math.max(0, almBB - almRO);
    const almHBDiff = Math.max(0, almHB - almRO);

    const matRO = d.almatarRoomOnly ?? 0;
    const matBB = d.almatarBreakfast ?? 0;
    const matHB = d.almatarHalfBoard ?? 0;
    const matBDiff = Math.max(0, matBB - matRO);
    const matHBDiff = Math.max(0, matHB - matRO);

    sumAlmRO += almRO;
    sumAlmBB += almBB;
    sumAlmHB += almHB;

    sumMatRO += matRO;
    sumMatBB += matBB;
    sumMatHB += matHB;

    sheet2Data.push([
      d.dayTitle || `اليوم ${d.dayNumber}`,
      d.dayOfWeek || '',
      d.date || '',
      d.capacityAdults || 2,
      almRO,
      almBB,
      almHB,
      almBDiff,
      Math.round((almBDiff / 2) * 100) / 100,
      almHBDiff,
      Math.round((almHBDiff / 2) * 100) / 100,
      d.almosaferCancellation || 'إلغاء مجاني',
      matRO,
      matBB,
      matHB,
      matBDiff,
      Math.round((matBDiff / 2) * 100) / 100,
      matHBDiff,
      Math.round((matHBDiff / 2) * 100) / 100,
      d.almatarCancellation || 'غير قابل للإسترداد',
      d.isWeekend ? 'عطلة أسبوعية' : 'عادي'
    ]);
  });

  // Totals Row
  sheet2Data.push([
    `المجموع الإجمالي (${summary.nights} ليالٍ)`,
    '',
    '',
    '',
    sumAlmRO,
    sumAlmBB,
    sumAlmHB,
    '-',
    '-',
    '-',
    '-',
    '',
    sumMatRO,
    sumMatBB,
    sumMatHB,
    '-',
    '-',
    '-',
    '-',
    '',
    ''
  ]);

  // Averages Row
  sheet2Data.push([
    'متوسط سعر الليلة الواحدة',
    '',
    '',
    '',
    Math.round(sumAlmRO / summary.nights),
    Math.round(sumAlmBB / summary.nights),
    Math.round(sumAlmHB / summary.nights),
    Math.round(Math.max(0, sumAlmBB - sumAlmRO) / summary.nights),
    Math.round((Math.max(0, sumAlmBB - sumAlmRO) / summary.nights / 2) * 100) / 100,
    Math.round(Math.max(0, sumAlmHB - sumAlmRO) / summary.nights),
    Math.round((Math.max(0, sumAlmHB - sumAlmRO) / summary.nights / 2) * 100) / 100,
    '',
    Math.round(sumMatRO / summary.nights),
    Math.round(sumMatBB / summary.nights),
    Math.round(sumMatHB / summary.nights),
    Math.round(Math.max(0, sumMatBB - sumMatRO) / summary.nights),
    Math.round((Math.max(0, sumMatBB - sumMatRO) / summary.nights / 2) * 100) / 100,
    Math.round(Math.max(0, sumMatHB - sumMatRO) / summary.nights),
    Math.round((Math.max(0, sumMatHB - sumMatRO) / summary.nights / 2) * 100) / 100,
    '',
    ''
  ]);

  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
  XLSX.utils.book_append_sheet(workbook, ws2, 'الجدول اليومي المقارن');

  const outPath = path.resolve('.', 'اسعار_الفندق_اليومية_من_2026-09-29_الى_2026-10-11_المحدثة.xlsx');
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  fs.writeFileSync(outPath, buffer);
  console.log(`Excel file created successfully at: ${outPath}`);
}

exportVerifiedExcel();
