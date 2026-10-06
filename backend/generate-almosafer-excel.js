import fs from 'fs';
import * as XLSX from '../frontend/node_modules/xlsx/xlsx.mjs';

function buildWorkbook() {
  const wb = XLSX.utils.book_new();

  const hotelName = 'فندق ميلينيوم مكة النسيم';
  const checkIn = '2026-10-15';
  const checkOut = '2026-10-16';
  const bookingUrl = 'https://www.almosafer.com/ar/hotel/details/atg/%D9%85%D9%8A%D9%84%D9%8A%D9%86%D9%8A%D9%88%D9%85-%D9%85%D9%83%D8%A9-%D8%A7%D9%84%D9%86%D8%B3%D9%8A%D9%85-1798852?checkin=15-10-2026&checkout=16-10-2026&rooms=2_adult&priceMode=total&lang=ar';
  const cancellationPolicy = 'إلغاء مجاني قبل تاريخ 02 أكتوبر 2026 (شامل الضريبة)';
  const lastUpdated = '٢٨ سبتمبر ٢٠٢٦، ٠٦:٥٨ م';

  // --- Sheet 1: دليل الغرف والوجبات ---
  const sheet1Data = [
    ['تقرير أسعار الغرف وخطط الوجبات الفندقية المعتمدة - موقع المسافر (Almosafer)'],
    ['اسم الفندق:', hotelName],
    ['الرابط المباشر على المسافر:', bookingUrl],
    ['فترة الإقامة:', `${checkIn} إلى ${checkOut} (1 ليلة)`],
    ['العملة المعتمدة:', 'ريال سعودي (SAR)'],
    [],
    ['=== أسعار غرف فندق ميلينيوم مكة النسيم المعتمدة على موقع المسافر ==='],
    [
      'المصدر',
      'اسم الفندق',
      'اسم الغرفة في الموقع',
      'نوع الغرفة',
      'سعة الأفراد',
      'تاريخ الوصول',
      'تاريخ المغادرة',
      'الليالي',
      'الغرف',
      'سعر إقامة فقط (ر.س)',
      'سعر إقامة وفطور (ر.س)',
      'سعر وجبتان / نصف إقامة (ر.س)',
      'العملة',
      'سياسة الإلغاء',
      'رابط الحجز المباشر للغرفة',
      'آخر تحديث'
    ],
    [
      'المسافر',
      hotelName,
      'غرفة ستاندرد مفردة',
      'مفردة (سنجل)',
      '1 فرد',
      checkIn,
      checkOut,
      1,
      1,
      175,
      235,
      440,
      'ر.س',
      cancellationPolicy,
      bookingUrl,
      lastUpdated
    ],
    [
      'المسافر',
      hotelName,
      'غرفة ستاندرد - ٢ سرير فردي',
      'مزدوجة (دبل / توأم)',
      '2 أفراد',
      checkIn,
      checkOut,
      1,
      1,
      203,
      271,
      495,
      'ر.س',
      cancellationPolicy,
      bookingUrl,
      lastUpdated
    ],
    [
      'المسافر',
      hotelName,
      'غرفة ستاندرد من ثلاثية - ٣ أسرّة فردية',
      'ثلاثية (تريبل)',
      '3 أفراد',
      checkIn,
      checkOut,
      1,
      1,
      275,
      368,
      690,
      'ر.س',
      cancellationPolicy,
      bookingUrl,
      lastUpdated
    ],
    [
      'المسافر',
      hotelName,
      'غرفة ستاندرد من رباعية - ٤ أسرّة فردية',
      'رباعية (عائلية)',
      '4 أفراد',
      checkIn,
      checkOut,
      1,
      1,
      372,
      488,
      923,
      'ر.س',
      'إلغاء مجاني قبل تاريخ 13 أكتوبر 2026 (شامل الضريبة)',
      bookingUrl,
      lastUpdated
    ]
  ];

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
  ws1['!cols'] = [
    { wch: 14 },
    { wch: 28 },
    { wch: 38 },
    { wch: 22 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 8 },
    { wch: 8 },
    { wch: 22 },
    { wch: 22 },
    { wch: 26 },
    { wch: 10 },
    { wch: 38 },
    { wch: 45 },
    { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'دليل الغرف والوجبات');

  // --- Sheet 2: الجدول اليومي ---
  const sheet2Data = [
    ['جدول مقارنة وتوزيع الأسعار بالتفصيل - فندق ميلينيوم مكة النسيم'],
    ['الفندق:', hotelName],
    ['فترة الإقامة:', `${checkIn} إلى ${checkOut} (1 ليلة)`],
    ['تاريخ التصدير:', lastUpdated],
    [],
    [
      'رقم اليوم',
      'اليوم',
      'التاريخ',
      'الغرفة المحددة',
      'سعة الأفراد',
      'إقامة فقط - المسافر (ر.س)',
      'إقامة وفطور - المسافر (ر.س)',
      'وجبتان - المسافر (ر.س)',
      'طبيعة اليوم'
    ],
    [
      'اليوم 1',
      'الخميس',
      checkIn,
      'غرفة ستاندرد - ٢ سرير فردي',
      '2 أفراد',
      203,
      271,
      495,
      'عادي'
    ],
    [
      'اليوم 1',
      'الخميس',
      checkIn,
      'غرفة ستاندرد من رباعية - ٤ أسرّة فردية',
      '4 أفراد',
      372,
      488,
      923,
      'عادي'
    ],
    [],
    [
      'المجموع (غرفة فردين)',
      '1 ليلة',
      '',
      'غرفة ستاندرد - ٢ سرير فردي',
      '2 أفراد',
      203,
      271,
      495,
      ''
    ],
    [
      'المجموع (غرفة 4 أفراد)',
      '1 ليلة',
      '',
      'غرفة ستاندرد من رباعية - ٤ أسرّة فردية',
      '4 أفراد',
      372,
      488,
      923,
      ''
    ]
  ];

  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
  ws2['!cols'] = [
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 32 },
    { wch: 14 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, 'الجدول اليومي');

  // --- Sheet 3: المسافر ---
  const sheet3Data = [
    ['عروض وأسعار غرف موقع المسافر - فندق ميلينيوم مكة النسيم'],
    ['فترة الإقامة:', `${checkIn} إلى ${checkOut}`],
    [],
    [
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
      'سعر إقامة وفطور (ر.س)',
      'سعر وجبتان / نصف إقامة (ر.س)',
      'العملة',
      'سياسة الإلغاء',
      'رابط الحجز المباشر للغرفة',
      'آخر تحديث'
    ],
    sheet1Data[8],
    sheet1Data[9],
    sheet1Data[10],
    sheet1Data[11],
    sheet1Data[12]
  ];

  const ws3 = XLSX.utils.aoa_to_sheet(sheet3Data);
  ws3['!cols'] = ws1['!cols'];
  XLSX.utils.book_append_sheet(wb, ws3, 'المسافر');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const targets = [
    'hotel-rooms-rates-2026-09-29 (8).xlsx',
    'فندق_ميلينيوم_مكة_النسيم_المسافر_معتمد_محدث.xlsx',
    'hotel-rooms-rates-2026-09-29 (7).xlsx',
    'hotel-rooms-rates-2026-09-29 (6).xlsx',
    'فندق_ميلينيوم_مكة_النسيم_المسافر_معتمد.xlsx'
  ];

  for (const t of targets) {
    try {
      fs.writeFileSync(t, buf);
      console.log('Successfully written:', t);
    } catch (e) {
      console.log('Skipped locked file (open in Excel):', t);
    }
  }
}

buildWorkbook();

