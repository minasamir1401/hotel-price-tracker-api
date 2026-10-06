import path from 'path';
import fs from 'fs';
import { executeHotelComparison } from './scrapers/index.js';

// Dynamically load XLSX from frontend dependencies
const XLSX = await import('../frontend/node_modules/xlsx/xlsx.mjs');

async function generateAlmarwaExcel() {
  const searchParams = {
    hotelInput: 'https://almatar.com/ar/hotels/rooms/mecca-al-marwa-rayhaan-by-rotana-makkah-133550/',
    roomNotes: 'غرفة واسعة بسرير توأم',
    checkIn: '2026-10-01',
    checkOut: '2026-11-01', // month 10
    adults: 2,
    children: 0,
    rooms: 1,
    sources: ['almatar'], // Only Almatar as requested
  };

  console.log('Fetching data for Al Marwa Rayhaan (Almatar)...');
  const response = await executeHotelComparison(searchParams);
  if (!response.success || !response.data) {
    console.error('Failed to get comparison data');
    process.exit(1);
  }

  const { data: results, summary } = response;
  
  // Find the requested room or use the first one if not found precisely
  let match = results.find(r => r.roomName.includes('توأم') || r.roomName.includes('Twin'));
  if (!match) match = results[0]; // fallback

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toLocaleTimeString('ar-SA');
  
  const workbook = XLSX.utils.book_new();

  // 1. Build Daily Sheet
  const dailyBreakdown = match.dailyRates; // Daily rates for the specific room
  const dailySheetData = [
    ['جدول أسعار المطار - المروة ريحان من روتانا مكة لشهر أكتوبر 2026 (31 ليلة)'],
    ['الفندق:', 'المروة ريحان من روتانا مكة'],
    ['الغرفة:', match.roomName],
    ['سعة الأفراد:', `2 أفراد (فردين)`],
    ['فترة الإقامة:', `2026-10-01 إلى 2026-11-01 (${dailyBreakdown.length} ليلة)`],
    ['تاريخ ووقت التصدير:', `${dateStr} ${timeStr}`],
    [],
    [
      'رقم اليوم',
      'اليوم',
      'التاريخ',
      'المطار: إقامة فقط (ر.س)',
      'المطار: إقامة وإفطار (ر.س)',
      'المطار: فطار وعشاء (ر.س)',
      'ملاحظات',
    ],
  ];

  let totalRoomOnly = 0, totalBreakfast = 0, totalHalfBoard = 0;

  dailyBreakdown.forEach((d) => {
    totalRoomOnly += d.roomOnlyPrice || 0;
    totalBreakfast += d.breakfastPrice || 0;
    totalHalfBoard += d.halfBoardPrice || 0;
    dailySheetData.push([
      d.dayTitle,
      d.dayOfWeek,
      d.date,
      d.roomOnlyPrice || 'غير متاح',
      d.breakfastPrice || 'غير متاح',
      d.halfBoardPrice || 'غير متاح',
      d.availability === 'available' ? (d.isWeekend ? 'عطلة أسبوعية' : 'عادي') : 'غير متاح',
    ]);
  });

  dailySheetData.push([]);
  dailySheetData.push([
    'المجموع الإجمالي (31 ليلة)',
    '',
    '',
    totalRoomOnly,
    totalBreakfast,
    totalHalfBoard,
    '',
  ]);

  dailySheetData.push([
    'متوسط سعر الليلة',
    '',
    '',
    Math.round(totalRoomOnly / dailyBreakdown.length),
    Math.round(totalBreakfast / dailyBreakdown.length),
    Math.round(totalHalfBoard / dailyBreakdown.length),
    '',
  ]);

  const dailyWorksheet = XLSX.utils.aoa_to_sheet(dailySheetData);
  dailyWorksheet['!cols'] = [
    { wch: 12 }, // Day Title
    { wch: 12 }, // Day of week
    { wch: 14 }, // Date
    { wch: 25 }, // Almatar Room Only
    { wch: 25 }, // Almatar Breakfast
    { wch: 25 }, // Almatar Half Board
    { wch: 16 }, // Note
  ];
  XLSX.utils.book_append_sheet(workbook, dailyWorksheet, 'أسعار أكتوبر اليومية');

  const rootDir = path.resolve('../');
  const targetFile = path.join(rootDir, 'المروة_ريحان_غرفة_توأم_شهر_أكتوبر.xlsx');

  const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  fs.writeFileSync(targetFile, excelBuffer);
  console.log('SUCCESS: Written to', targetFile);
}

generateAlmarwaExcel().catch((err) => {
  console.error('Error generating excel:', err);
  process.exit(1);
});
