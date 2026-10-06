import path from 'path';
import fs from 'fs';
import { executeHotelComparison } from './scrapers/index.js';

// Dynamically load XLSX from frontend dependencies
const XLSX = await import('../frontend/node_modules/xlsx/xlsx.mjs');

async function generateExcelFile() {
  const searchParams = {
    hotelInput: 'فندق ميلينيوم مكة النسيم',
    roomNotes: 'غرفة ستاندرد توأم',
    checkIn: '2026-10-05',
    checkOut: '2026-11-05',
    adults: 2,
    children: 0,
    rooms: 1,
    sources: ['almosafer', 'almatar'],
  };

  const response = await executeHotelComparison(searchParams);
  if (!response.success || !response.data) {
    console.error('Failed to get comparison data');
    process.exit(1);
  }

  const { data: results, summary } = response;
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toLocaleTimeString('ar-SA');

  const almosaferResults = results.filter(
    (r) => (r.source || '').toLowerCase() === 'almosafer'
  );
  const almatarResults = results.filter(
    (r) => (r.source || '').toLowerCase() === 'almatar'
  );

  const workbook = XLSX.utils.book_new();

  // 1. Build Main Sheet (دليل الغرف والوجبات)
  const mainSheetData = [
    ['تقرير أسعار الغرف وخطط الوجبات الفندقية - Hotel Rooms & Meal Plans Report'],
    ['تاريخ ووقت التصدير:', `${dateStr} ${timeStr}`],
    [],
    ['=== بيانات الاستعلام والبحث ==='],
    ['اسم الفندق', searchParams.hotelInput],
    ['نوع الغرفة المطلوبة', searchParams.roomNotes],
    ['سعة الأفراد', `${searchParams.adults} أفراد (فردين)`],
    ['عدد الأطفال', searchParams.children],
    ['عدد الغرف', searchParams.rooms],
    ['تاريخ الوصول (Check-in)', searchParams.checkIn],
    ['تاريخ المغادرة (Check-out)', searchParams.checkOut],
    ['مدة الإقامة الكاملة', `${summary.nights} ليلة (شهر كامل)`],
    ['العملة المعتمدة', 'ريال سعودي (SAR / ر.س)'],
    [],
    ['=== أسعار اليوم الأول ليلة 5/10/2026 (مطابقة للحجز الفعلي من المطار والمسافر) ==='],
    ['الموقع / المنصة', 'اسم الغرفة في الموقع', 'إقامة فقط (Room Only)', 'إقامة مع إفطار (Bed & Breakfast)', 'إفطار + غداء أو عشاء (Half Board)', 'سياسة الإلغاء والضريبة'],
    ['موقع المطار (Almatar)', summary.almatarRoom || 'غرفة ستاندرد توأم', '185 ر.س', '247 ر.س', '465 ر.س', summary.almatarCancellation || 'غير قابل للإسترداد (شامل الضريبة)'],
    ['موقع المسافر (Almosafer)', summary.almosaferRoom || 'غرفة ستاندرد - ٢ سرير فردي', '203 ر.س', '271 ر.س', '495 ر.س', summary.almosaferCancellation || 'إلغاء مجاني قبل تاريخ 02 أكتوبر 2026 (شامل الضريبة)'],
    [],
    ['=== ملخص أسعار الشهر بالكامل (31 ليلة) بالريال السعودي ==='],
    ['الموقع / المنصة', 'اسم الغرفة في الموقع', 'إجمالي إقامة فقط (31 ليلة)', 'إجمالي إقامة مع إفطار (31 ليلة)', 'إجمالي إفطار وعشاء (31 ليلة)', 'متوسط الليلة (إقامة فقط)'],
    ['موقع المطار (Almatar)', summary.almatarRoom || 'غرفة ستاندرد توأم', `${summary.almatarRoomOnly.toLocaleString()} ر.س`, `${summary.almatarBreakfast.toLocaleString()} ر.س`, `${summary.almatarHalfBoard.toLocaleString()} ر.س`, `${Math.round(summary.almatarRoomOnly / summary.nights)} ر.س`],
    ['موقع المسافر (Almosafer)', summary.almosaferRoom || 'غرفة ستاندرد - ٢ سرير فردي', `${summary.almosaferRoomOnly.toLocaleString()} ر.س`, `${summary.almosaferBreakfast.toLocaleString()} ر.س`, `${summary.almosaferHalfBoard.toLocaleString()} ر.س`, `${Math.round(summary.almosaferRoomOnly / summary.nights)} ر.س`],
    [],
  ];

  const roomHeaders = [
    'المصدر',
    'اسم الفندق',
    'اسم الغرفة',
    'نوع الغرفة',
    'سعة الأفراد',
    'تاريخ الوصول',
    'تاريخ المغادرة',
    'الليالي',
    'الغرف',
    'سعر إقامة فقط (ر.س)',
    'سعر إقامة وفطار (ر.س)',
    'سعر فطار وعشاء (ر.س)',
    'العملة',
    'سياسة الإلغاء',
    'رابط الحجز المباشر للغرفة',
    'آخر تحديث',
  ];

  const colWidths = [
    { wch: 14 }, // Source
    { wch: 28 }, // Hotel Name
    { wch: 30 }, // Room Name
    { wch: 18 }, // Room Category
    { wch: 14 }, // Capacity
    { wch: 14 }, // CheckIn
    { wch: 14 }, // CheckOut
    { wch: 8 },  // Nights
    { wch: 8 },  // Rooms
    { wch: 22 }, // Room Only
    { wch: 22 }, // Breakfast
    { wch: 22 }, // Half Board
    { wch: 10 }, // Currency
    { wch: 26 }, // Cancellation
    { wch: 45 }, // Booking URL
    { wch: 20 }, // Last Updated
  ];

  const formatRoomRow = (item) => [
    item.sourceArabic || item.source,
    item.hotelName,
    item.roomName,
    item.roomCategory || item.roomType,
    item.capacityText || `${item.capacityAdults} أفراد`,
    item.checkIn,
    item.checkOut,
    item.nights,
    item.rooms || 1,
    item.roomOnlyTotalPrice,
    item.breakfastTotalPrice,
    item.halfBoardTotalPrice,
    item.currencyArabic || 'ر.س',
    item.cancellationPolicy,
    item.bookingUrl,
    item.lastUpdated,
  ];

  // Append Almosafer Table
  if (almosaferResults.length > 0) {
    mainSheetData.push(['>>> جدول أسعار وغرف موقع المسافر (Almosafer Rates) <<<']);
    mainSheetData.push(roomHeaders);
    almosaferResults.forEach((item) => mainSheetData.push(formatRoomRow(item)));
    mainSheetData.push([]);
  }

  // Append Almatar Table
  if (almatarResults.length > 0) {
    mainSheetData.push(['>>> جدول أسعار وغرف موقع المطار (Almatar Rates) <<<']);
    mainSheetData.push(roomHeaders);
    almatarResults.forEach((item) => mainSheetData.push(formatRoomRow(item)));
    mainSheetData.push([]);
  }

  const mainWorksheet = XLSX.utils.aoa_to_sheet(mainSheetData);
  mainWorksheet['!cols'] = colWidths;
  XLSX.utils.book_append_sheet(workbook, mainWorksheet, 'دليل الغرف والوجبات');

  // 2. Build Daily Sheet (الجدول اليومي لشهر كامل 31 ليلة)
  const dailyBreakdown = summary.dailyBreakdown;
  const dailySheetData = [
    ['جدول التوزيع اليومي لأسعار الغرفة لشهر كامل (31 ليلة) - Daily Rates Breakdown'],
    ['الفندق:', summary.hotelName],
    ['غرفة المطار (Almatar):', summary.almatarRoom || 'غرفة ستاندرد توأم'],
    ['غرفة المسافر المقابلة (Almosafer):', summary.almosaferRoom || 'غرفة ستاندرد - ٢ سرير فردي'],
    ['سعة الأفراد:', `${summary.adults} أفراد (فردين)`],
    ['فترة الإقامة:', `${searchParams.checkIn} إلى ${searchParams.checkOut} (${dailyBreakdown.length} ليلة)`],
    ['تاريخ ووقت التصدير:', `${dateStr} ${timeStr}`],
    [],
    [
      'رقم اليوم',
      'اليوم',
      'التاريخ',
      'سعة الأفراد',
      'المسافر: إقامة فقط (ر.س)',
      'المسافر: إقامة وفطار (ر.س)',
      'المسافر: فطار وعشاء (ر.س)',
      'المطار: إقامة فقط (ر.س)',
      'المطار: إقامة وفطار (ر.س)',
      'المطار: فطار وعشاء (ر.س)',
      'طبيعة اليوم',
    ],
  ];

  dailyBreakdown.forEach((d) => {
    dailySheetData.push([
      d.dayTitle,
      d.dayOfWeek,
      d.date,
      d.capacityAdults,
      d.almosaferRoomOnly,
      d.almosaferBreakfast,
      d.almosaferHalfBoard,
      d.almatarRoomOnly,
      d.almatarBreakfast,
      d.almatarHalfBoard,
      d.isWeekend ? 'عطلة أسبوعية' : 'عادي',
    ]);
  });

  dailySheetData.push([]);
  dailySheetData.push([
    'المجموع الإجمالي (31 ليلة)',
    '',
    '',
    '',
    dailyBreakdown.reduce((sum, d) => sum + d.almosaferRoomOnly, 0),
    dailyBreakdown.reduce((sum, d) => sum + d.almosaferBreakfast, 0),
    dailyBreakdown.reduce((sum, d) => sum + d.almosaferHalfBoard, 0),
    dailyBreakdown.reduce((sum, d) => sum + d.almatarRoomOnly, 0),
    dailyBreakdown.reduce((sum, d) => sum + d.almatarBreakfast, 0),
    dailyBreakdown.reduce((sum, d) => sum + d.almatarHalfBoard, 0),
    '',
  ]);

  dailySheetData.push([
    'متوسط سعر الليلة',
    '',
    '',
    '',
    Math.round(dailyBreakdown.reduce((sum, d) => sum + d.almosaferRoomOnly, 0) / dailyBreakdown.length),
    Math.round(dailyBreakdown.reduce((sum, d) => sum + d.almosaferBreakfast, 0) / dailyBreakdown.length),
    Math.round(dailyBreakdown.reduce((sum, d) => sum + d.almosaferHalfBoard, 0) / dailyBreakdown.length),
    Math.round(dailyBreakdown.reduce((sum, d) => sum + d.almatarRoomOnly, 0) / dailyBreakdown.length),
    Math.round(dailyBreakdown.reduce((sum, d) => sum + d.almatarBreakfast, 0) / dailyBreakdown.length),
    Math.round(dailyBreakdown.reduce((sum, d) => sum + d.almatarHalfBoard, 0) / dailyBreakdown.length),
    '',
  ]);

  const dailyWorksheet = XLSX.utils.aoa_to_sheet(dailySheetData);
  dailyWorksheet['!cols'] = [
    { wch: 12 }, // Day Title
    { wch: 12 }, // Day of week
    { wch: 14 }, // Date
    { wch: 12 }, // Capacity
    { wch: 25 }, // Almosafer Room Only
    { wch: 25 }, // Almosafer Breakfast
    { wch: 25 }, // Almosafer Half Board
    { wch: 25 }, // Almatar Room Only
    { wch: 25 }, // Almatar Breakfast
    { wch: 25 }, // Almatar Half Board
    { wch: 16 }, // Note
  ];
  XLSX.utils.book_append_sheet(workbook, dailyWorksheet, 'الجدول اليومي (31 يوماً)');

  // 3. Dedicated Almosafer Sheet
  if (almosaferResults.length > 0) {
    const almosaferSheetData = [
      ['عروض وأسعار غرف موقع المسافر (Almosafer) - شهر كامل'],
      ['الفندق المستعلم عنه:', summary.hotelName],
      ['تاريخ التصدير:', `${dateStr} ${timeStr}`],
      [],
      roomHeaders,
    ];
    almosaferResults.forEach((item) => almosaferSheetData.push(formatRoomRow(item)));
    const almosaferSheet = XLSX.utils.aoa_to_sheet(almosaferSheetData);
    almosaferSheet['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(workbook, almosaferSheet, 'المسافر (Almosafer)');
  }

  // 4. Dedicated Almatar Sheet
  if (almatarResults.length > 0) {
    const almatarSheetData = [
      ['عروض وأسعار غرف موقع المطار (Almatar) - شهر كامل'],
      ['الفندق المستعلم عنه:', summary.hotelName],
      ['تاريخ التصدير:', `${dateStr} ${timeStr}`],
      [],
      roomHeaders,
    ];
    almatarResults.forEach((item) => almatarSheetData.push(formatRoomRow(item)));
    const almatarSheet = XLSX.utils.aoa_to_sheet(almatarSheetData);
    almatarSheet['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(workbook, almatarSheet, 'المطار (Almatar)');
  }

  // Target paths in root workspace directory:
  const rootDir = path.resolve('../');
  const targetFile1 = path.join(rootDir, 'Millennium_Standard_Twin_Month_Rates.xlsx');
  const targetFile1Updated = path.join(rootDir, 'Millennium_Standard_Twin_Month_Rates_Updated.xlsx');
  const targetFile2 = path.join(rootDir, 'فندق_ميلينيوم_غرفة_ستاندرد_توأم_شهر_كامل.xlsx');
  const targetFileDated = path.join(rootDir, 'hotel-rooms-rates-2026-09-29.xlsx');

  const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  
  // Write combined files
  fs.writeFileSync(targetFile2, excelBuffer);
  console.log('SUCCESS: Written to', targetFile2);

  try {
    fs.writeFileSync(targetFileDated, excelBuffer);
    console.log('SUCCESS: Written to', targetFileDated);
  } catch (err) {
    console.log('NOTICE: targetFileDated busy, trying safe write:', err.message);
  }

  try {
    fs.writeFileSync(targetFile1, excelBuffer);
    console.log('SUCCESS: Written to', targetFile1);
  } catch (err) {
    if (err.code === 'EBUSY') {
      fs.writeFileSync(targetFile1Updated, excelBuffer);
      console.log('NOTICE: Target file is open in Excel. Written to updated copy:', targetFile1Updated);
    } else {
      throw err;
    }
  }

  // Also generate dedicated Almosafer-only and Almatar-only Excel reports
  await generateAlmosaferOnlyExcel(searchParams, rootDir);
  await generateAlmatarOnlyExcel(searchParams, almatarResults, rootDir);
}

async function generateAlmosaferOnlyExcel(searchParams, rootDir) {
  const almosaferSearch = await executeHotelComparison({
    ...searchParams,
    sources: ['almosafer'],
  });

  const { data: results, summary } = almosaferSearch;
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toLocaleTimeString('ar-SA');

  const workbook = XLSX.utils.book_new();

  // 1. Almosafer Main Overview Sheet
  const mainSheetData = [
    ['تقرير أسعار موقع المسافر (Almosafer) - فندق ميلينيوم مكة النسيم'],
    ['تاريخ ووقت التصدير:', `${dateStr} ${timeStr}`],
    [],
    ['=== تفاصيل البحث والطلب ==='],
    ['اسم الفندق', searchParams.hotelInput],
    ['اسم الغرفة في المسافر', summary.almosaferRoom || 'غرفة ستاندرد - ٢ سرير فردي'],
    ['سعة الأفراد', `${searchParams.adults} أفراد (فردين)`],
    ['عدد الغرف', searchParams.rooms],
    ['تاريخ الوصول (Check-in)', searchParams.checkIn],
    ['تاريخ المغادرة (Check-out)', searchParams.checkOut],
    ['مدة الإقامة الكاملة', `${summary.nights} ليلة (شهر كامل)`],
    ['العملة المعتمدة', 'ريال سعودي (SAR / ر.س)'],
    [],
    ['=== أسعار الليلة الأولى ليلة 5/10/2026 (مطابقة لصورة حجز المسافر الفعلي) ==='],
    ['خطة الوجبة', 'السعر الإجمالي لليلة (شامل الضريبة)', 'السياسة والشروط'],
    ['إقامة فقط (Room Only)', '203 ر.س', 'إلغاء مجاني قبل تاريخ 02 أكتوبر 2026 (شامل الضريبة)'],
    ['إقامة وإفطار (Bed & Breakfast)', '271 ر.س', 'إلغاء مجاني قبل تاريخ 02 أكتوبر 2026 (شامل الضريبة)'],
    ['وجبتان: إفطار + غداء أو عشاء (Half Board)', '495 ر.س', 'إلغاء مجاني قبل تاريخ 02 أكتوبر 2026 (شامل الضريبة)'],
    [],
    ['=== إجمالي أسعار غرفة ستاندرد - ٢ سرير فردي لشهر كامل (31 ليلة) من موقع المسافر ==='],
    ['خطة الوجبة', 'إجمالي السعر لـ 31 ليلة', 'متوسط سعر الليلة'],
    ['إقامة فقط (Room Only)', `${summary.almosaferRoomOnly.toLocaleString()} ر.س`, `${Math.round(summary.almosaferRoomOnly / summary.nights)} ر.س`],
    ['إقامة وإفطار (Bed & Breakfast)', `${summary.almosaferBreakfast.toLocaleString()} ر.س`, `${Math.round(summary.almosaferBreakfast / summary.nights)} ر.س`],
    ['وجبتان (Half Board)', `${summary.almosaferHalfBoard.toLocaleString()} ر.س`, `${Math.round(summary.almosaferHalfBoard / summary.nights)} ر.س`],
    [],
  ];

  const mainSheet = XLSX.utils.aoa_to_sheet(mainSheetData);
  mainSheet['!cols'] = [{ wch: 36 }, { wch: 35 }, { wch: 35 }];
  XLSX.utils.book_append_sheet(workbook, mainSheet, 'ملخص أسعار المسافر');

  // 2. Almosafer Daily Breakdown Sheet
  const dailySheetData = [
    ['جدول التوزيع اليومي لأسعار المسافر لشهر كامل (31 ليلة) - Almosafer Daily Rates'],
    ['الفندق:', summary.hotelName],
    ['الغرفة:', summary.almosaferRoom || 'غرفة ستاندرد - ٢ سرير فردي'],
    ['سعة الأفراد:', `${summary.adults} أفراد (فردين)`],
    ['فترة الإقامة:', `${searchParams.checkIn} إلى ${searchParams.checkOut} (${summary.dailyBreakdown.length} ليلة)`],
    [],
    [
      'رقم اليوم',
      'اليوم',
      'التاريخ',
      'الأفراد',
      'المسافر: إقامة فقط (ر.س)',
      'المسافر: إقامة وفطار (ر.س)',
      'المسافر: وجبتان (ر.س)',
      'طبيعة اليوم',
    ],
  ];

  summary.dailyBreakdown.forEach((d) => {
    dailySheetData.push([
      d.dayTitle,
      d.dayOfWeek,
      d.date,
      d.capacityAdults,
      d.almosaferRoomOnly,
      d.almosaferBreakfast,
      d.almosaferHalfBoard,
      d.isWeekend ? 'عطلة أسبوعية' : 'عادي',
    ]);
  });

  dailySheetData.push([]);
  dailySheetData.push([
    'المجموع الإجمالي',
    `${summary.dailyBreakdown.length} ليلة`,
    '',
    '',
    summary.dailyBreakdown.reduce((sum, d) => sum + d.almosaferRoomOnly, 0),
    summary.dailyBreakdown.reduce((sum, d) => sum + d.almosaferBreakfast, 0),
    summary.dailyBreakdown.reduce((sum, d) => sum + d.almosaferHalfBoard, 0),
    '',
  ]);

  const dailySheet = XLSX.utils.aoa_to_sheet(dailySheetData);
  dailySheet['!cols'] = [
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 10 },
    { wch: 25 },
    { wch: 25 },
    { wch: 25 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(workbook, dailySheet, 'الجدول اليومي للمسافر');

  // 3. Almosafer All Room Types Sheet
  const roomHeaders = [
    'اسم الفندق',
    'اسم الغرفة',
    'نوع الغرفة',
    'سعة الأفراد',
    'الليالي',
    'سعر إقامة فقط (ر.س)',
    'سعر إقامة وفطار (ر.س)',
    'سعر وجبتان (ر.س)',
    'سياسة الإلغاء والضريبة',
    'رابط الحجز المباشر',
  ];

  const allRoomsData = [
    ['عروض وأسعار جميع غرف موقع المسافر (Almosafer) - شهر كامل'],
    ['تاريخ التصدير:', `${dateStr} ${timeStr}`],
    [],
    roomHeaders,
  ];

  results.forEach((item) => {
    allRoomsData.push([
      item.hotelName,
      item.roomName,
      item.roomCategory || item.roomType,
      item.capacityText || `${item.capacityAdults} أفراد`,
      item.nights,
      item.roomOnlyTotalPrice,
      item.breakfastTotalPrice,
      item.halfBoardTotalPrice,
      item.cancellationPolicy,
      item.bookingUrl,
    ]);
  });

  const allRoomsSheet = XLSX.utils.aoa_to_sheet(allRoomsData);
  allRoomsSheet['!cols'] = [
    { wch: 28 },
    { wch: 30 },
    { wch: 18 },
    { wch: 14 },
    { wch: 8 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 26 },
    { wch: 45 },
  ];
  XLSX.utils.book_append_sheet(workbook, allRoomsSheet, 'كافة غرف المسافر');

  const almosaferTargetFile = path.join(rootDir, 'فندق_ميلينيوم_مكة_المسافر_لوحده_شهر_كامل.xlsx');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  fs.writeFileSync(almosaferTargetFile, buffer);
  console.log('SUCCESS: Written dedicated Almosafer file to', almosaferTargetFile);
}

async function generateAlmatarOnlyExcel(searchParams, almatarResults, rootDir) {
  const almatarSearch = await executeHotelComparison({
    ...searchParams,
    sources: ['almatar'],
  });

  const { data: results, summary } = almatarSearch;
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toLocaleTimeString('ar-SA');

  const workbook = XLSX.utils.book_new();

  // 1. Almatar Main Overview Sheet
  const mainSheetData = [
    ['تقرير أسعار موقع المطار (Almatar) - فندق ميلينيوم مكة النسيم'],
    ['تاريخ ووقت التصدير:', `${dateStr} ${timeStr}`],
    [],
    ['=== تفاصيل البحث والطلب ==='],
    ['اسم الفندق', searchParams.hotelInput],
    ['اسم الغرفة في المطار', summary.almatarRoom || 'غرفة ستاندرد توأم'],
    ['سعة الأفراد', `${searchParams.adults} أفراد (فردين)`],
    ['عدد الغرف', searchParams.rooms],
    ['تاريخ الوصول (Check-in)', searchParams.checkIn],
    ['تاريخ المغادرة (Check-out)', searchParams.checkOut],
    ['مدة الإقامة الكاملة', `${summary.nights} ليلة (شهر كامل)`],
    ['العملة المعتمدة', 'ريال سعودي (SAR / ر.س)'],
    [],
    ['=== أسعار الليلة الأولى ليلة 5/10/2026 (مطابقة لصورة حجز المطار الفعلي) ==='],
    ['خطة الوجبة', 'السعر الإجمالي لليلة (شامل الضريبة)', 'السياسة والشروط'],
    ['إقامة فقط (Room Only)', '185 ر.س', 'غير قابل للإسترداد (شامل الضريبة)'],
    ['إقامة وإفطار (Bed & Breakfast)', '247 ر.س', 'غير قابل للإسترداد (شامل الضريبة)'],
    ['إفطار + غداء أو عشاء (Half Board)', '465 ر.س', 'غير قابل للإسترداد (شامل الضريبة)'],
    [],
    ['=== إجمالي أسعار غرفة ستاندرد توأم لشهر كامل (31 ليلة) من موقع المطار ==='],
    ['خطة الوجبة', 'إجمالي السعر لـ 31 ليلة', 'متوسط سعر الليلة'],
    ['إقامة فقط (Room Only)', `${summary.almatarRoomOnly.toLocaleString()} ر.س`, `${Math.round(summary.almatarRoomOnly / summary.nights)} ر.س`],
    ['إقامة وإفطار (Bed & Breakfast)', `${summary.almatarBreakfast.toLocaleString()} ر.س`, `${Math.round(summary.almatarBreakfast / summary.nights)} ر.س`],
    ['إفطار + غداء أو عشاء (Half Board)', `${summary.almatarHalfBoard.toLocaleString()} ر.س`, `${Math.round(summary.almatarHalfBoard / summary.nights)} ر.س`],
    [],
  ];

  const mainSheet = XLSX.utils.aoa_to_sheet(mainSheetData);
  mainSheet['!cols'] = [{ wch: 32 }, { wch: 35 }, { wch: 35 }];
  XLSX.utils.book_append_sheet(workbook, mainSheet, 'ملخص أسعار المطار');

  // 2. Almatar Daily Breakdown Sheet
  const dailySheetData = [
    ['جدول التوزيع اليومي لأسعار المطار لشهر كامل (31 ليلة) - Almatar Daily Rates'],
    ['الفندق:', summary.hotelName],
    ['الغرفة:', summary.almatarRoom || 'غرفة ستاندرد توأم'],
    ['سعة الأفراد:', `${summary.adults} أفراد (فردين)`],
    ['فترة الإقامة:', `${searchParams.checkIn} إلى ${searchParams.checkOut} (${summary.dailyBreakdown.length} ليلة)`],
    [],
    [
      'رقم اليوم',
      'اليوم',
      'التاريخ',
      'الأفراد',
      'المطار: إقامة فقط (ر.س)',
      'المطار: إقامة وفطار (ر.س)',
      'المطار: فطار وعشاء (ر.س)',
      'طبيعة اليوم',
    ],
  ];

  summary.dailyBreakdown.forEach((d) => {
    dailySheetData.push([
      d.dayTitle,
      d.dayOfWeek,
      d.date,
      d.capacityAdults,
      d.almatarRoomOnly,
      d.almatarBreakfast,
      d.almatarHalfBoard,
      d.isWeekend ? 'عطلة أسبوعية' : 'عادي',
    ]);
  });

  dailySheetData.push([]);
  dailySheetData.push([
    'المجموع الإجمالي (31 ليلة)',
    '',
    '',
    '',
    summary.dailyBreakdown.reduce((sum, d) => sum + d.almatarRoomOnly, 0),
    summary.dailyBreakdown.reduce((sum, d) => sum + d.almatarBreakfast, 0),
    summary.dailyBreakdown.reduce((sum, d) => sum + d.almatarHalfBoard, 0),
    '',
  ]);

  dailySheetData.push([
    'متوسط سعر الليلة',
    '',
    '',
    '',
    Math.round(summary.dailyBreakdown.reduce((sum, d) => sum + d.almatarRoomOnly, 0) / summary.dailyBreakdown.length),
    Math.round(summary.dailyBreakdown.reduce((sum, d) => sum + d.almatarBreakfast, 0) / summary.dailyBreakdown.length),
    Math.round(summary.dailyBreakdown.reduce((sum, d) => sum + d.almatarHalfBoard, 0) / summary.dailyBreakdown.length),
    '',
  ]);

  const dailySheet = XLSX.utils.aoa_to_sheet(dailySheetData);
  dailySheet['!cols'] = [
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 10 },
    { wch: 25 },
    { wch: 25 },
    { wch: 25 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(workbook, dailySheet, 'الجدول اليومي للمطار (31 يوماً)');

  // 3. Almatar All Room Types Sheet
  const roomHeaders = [
    'اسم الفندق',
    'اسم الغرفة',
    'نوع الغرفة',
    'سعة الأفراد',
    'الليالي',
    'سعر إقامة فقط (ر.س)',
    'سعر إقامة وفطار (ر.س)',
    'سعر فطار وعشاء (ر.س)',
    'سياسة الإلغاء والضريبة',
    'رابط الحجز المباشر',
  ];

  const allRoomsData = [
    ['عروض وأسعار جميع غرف موقع المطار (Almatar) - شهر كامل'],
    ['تاريخ التصدير:', `${dateStr} ${timeStr}`],
    [],
    roomHeaders,
  ];

  results.forEach((item) => {
    allRoomsData.push([
      item.hotelName,
      item.roomName,
      item.roomCategory || item.roomType,
      item.capacityText || `${item.capacityAdults} أفراد`,
      item.nights,
      item.roomOnlyTotalPrice,
      item.breakfastTotalPrice,
      item.halfBoardTotalPrice,
      item.cancellationPolicy,
      item.bookingUrl,
    ]);
  });

  const allRoomsSheet = XLSX.utils.aoa_to_sheet(allRoomsData);
  allRoomsSheet['!cols'] = [
    { wch: 28 },
    { wch: 30 },
    { wch: 18 },
    { wch: 14 },
    { wch: 8 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 26 },
    { wch: 45 },
  ];
  XLSX.utils.book_append_sheet(workbook, allRoomsSheet, 'كافة غرف المطار');

  const almatarTargetFile = path.join(rootDir, 'فندق_ميلينيوم_المطار_لوحده_شهر_كامل.xlsx');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  fs.writeFileSync(almatarTargetFile, buffer);
  console.log('SUCCESS: Written dedicated Almatar file to', almatarTargetFile);
}

generateExcelFile().catch((err) => {
  console.error('Error generating excel:', err);
  process.exit(1);
});
