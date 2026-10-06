import { createAlmatarClient } from './scrapers/almatar-client.js';
import { createAlmatarResolver } from './scrapers/almatar.js';

const query = createAlmatarClient();
const resolve = createAlmatarResolver();
const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const normalize = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();

export async function fetchOneNight({ hotelId, hotelProfileKey, countryCode = 'SA', checkIn, checkOut, adults = 2, childAges = [], rooms = 1, fastRoomsOnly = false }, queryImpl = query) {
  const groups = await queryImpl({
    hotelId, hotelProfileKey, countryCode, checkIn, checkOut, currency: 'SAR',
    roomsInfo: Array.from({ length: rooms }, () => ({ adultsCount: adults, kidsAges: childAges })),
    fastRoomsOnly,
  }, { refresh: !fastRoomsOnly });
  const offers = [];
  for (const group of Object.values(groups)) {
    for (const [field, offer] of Object.entries(group.offers)) {
      offers.push({
        ...offer, roomName: group.originalNames?.[0] || group.name,
        bedType: group.beddingLabel, beds: group.beds, originalNames: group.originalNames,
        plan: field, flexible: field.endsWith('Flexible') || offer.cancellationPolicy === 'قابل للإسترداد',
      });
    }
  }
  return { available: offers.length > 0, rooms: offers };
}

export function createDailyPricesFetcher({ queryImpl = query, resolveImpl = resolve } = {}) {
  return async ({ hotelInput, checkIn, checkOut, adults = 2, rooms = 1, childAges = [], roomKeywords = [], roomName = '', bedCount = 0, bedType = 'any', includeUnknownBeds = false, mealPlan = '', concurrency = 4, onProgress }) => {
    const start = Date.parse(`${checkIn}T12:00:00Z`), end = Date.parse(`${checkOut}T12:00:00Z`);
    const nights = (end - start) / 86400000;
    if (!Number.isInteger(nights) || nights < 1 || nights > 62) throw new Error('اختر فترة صحيحة من ليلة إلى 62 ليلة');
    if (!Number.isInteger(adults) || adults < 1 || adults > 8 || !Number.isInteger(rooms) || rooms < 1 || rooms > 4) throw new Error('عدد البالغين أو الغرف غير صالح');
    if (!Array.isArray(childAges) || childAges.some(age => !Number.isInteger(age) || age < 0 || age > 17)) throw new Error('أعمار الأطفال غير صالحة');
    if (mealPlan && !['roomOnly', 'breakfast', 'halfBoard'].includes(mealPlan)) throw new Error('خطة الوجبات غير صالحة');
    const details = await resolveImpl(hotelInput);
    const dates = Array.from({ length: nights }, (_, i) => ({
      date: new Date(start + i * 86400000).toISOString().slice(0, 10),
      nextDate: new Date(start + (i + 1) * 86400000).toISOString().slice(0, 10),
      dayName: DAY_NAMES[new Date(start + i * 86400000).getUTCDay()],
    }));
    const results = new Array(nights);
    async function fetchDay(index) {
      const day = dates[index];
      try {
        const data = await fetchOneNight({ ...details, checkIn: day.date, checkOut: day.nextDate, adults, rooms, childAges }, queryImpl);
        const pool = data.rooms.filter(offer => {
          const basePlan = offer.plan.replace(/Flexible$/, '');
          const names = offer.originalNames || [offer.roomName];
          const matchesName = !roomName || names.some(name => normalize(name) === normalize(roomName));
          const matchesKeywords = roomKeywords.length === 0 || roomKeywords.every(word => normalize(offer.roomName).includes(normalize(word)));
          const matchesMeal = !mealPlan || basePlan === mealPlan;
          const matchesBeds = Boolean(roomName) || (!bedCount && bedType === 'any') || (includeUnknownBeds && (!offer.beds || !offer.beds.length)) || offer.beds?.some(bed => bed.options?.some(option => (!bedCount || option.count === bedCount) && (bedType === 'any' || option.type === bedType)));
          return matchesName && matchesKeywords && matchesMeal && matchesBeds;
        });
        const offers = {};
        for (const offer of pool) {
          const field = offer.plan;
          if (!offers[field] || offers[field].price > offer.price) {
            offers[field] = offer;
          }
        }

        const planKey = mealPlan || 'breakfast';
        const planCandidates = [offers[planKey], offers[`${planKey}Flexible`]].filter(Boolean);
        const selected = planCandidates.length > 0
          ? planCandidates.sort((a, b) => a.price - b.price)[0]
          : Object.values(offers).sort((a, b) => a.price - b.price)[0];
        const status = selected ? selected.cancellationPolicy || (selected.flexible ? 'قابل للإسترداد' : 'غير قابل للإسترداد') : 'لا توجد غرفة متاحة';
        results[index] = { ...day, offers, status, error: null };
      } catch (error) {
        results[index] = { ...day, offers: {}, status: 'تعذر التحقق', error: error.message };
      }
    }
    concurrency = Math.max(1, Math.min(6, Math.floor(Number(concurrency) || 4)));
    for (let i = 0; i < nights; i += concurrency) {
      await Promise.all(dates.slice(i, i + concurrency).map((_, j) => fetchDay(i + j)));
      if (typeof onProgress === 'function') {
        const completed = Math.min(i + concurrency, nights);
        const lastBatchDate = dates[Math.min(i + concurrency - 1, nights - 1)]?.date;
        onProgress({ completed, total: nights, currentDay: lastBatchDate });
      }
    }
    const rows = results.map((day, i) => {
      const price = field => day.offers[field]?.price ?? null;
      const origPrice = field => day.offers[field]?.originalPrice ?? null;
      const rawPrice = field => day.offers[field]?.sourceTotalPrice ? (day.offers[field].sourceTotalPrice / rooms) : (day.offers[field]?.price ?? null);
      const rawOrigPrice = field => day.offers[field]?.sourceOriginalPrice ? (day.offers[field].sourceOriginalPrice / rooms) : (day.offers[field]?.originalPrice ?? null);

      const formatted = field => price(field) === null ? 'غير متاح' : price(field).toFixed(2);
      const formattedOrig = field => origPrice(field) === null ? null : origPrice(field).toFixed(2);
      const formattedRaw = field => rawPrice(field) === null ? null : Number(rawPrice(field).toFixed(2));
      const formattedRawOrig = field => rawOrigPrice(field) === null ? null : Number(rawOrigPrice(field).toFixed(2));

      const pRo = price('roomOnly');
      const pBf = price('breakfast');
      const pBfDiff = (pBf !== null && pRo !== null) ? (pBf - pRo).toFixed(2) : 'غير متاح';

      const rRo = rawPrice('roomOnly');
      const rBf = rawPrice('breakfast');
      const rBfDiff = (rBf !== null && rRo !== null) ? Number((rBf - rRo).toFixed(2)) : null;

      return {
        rowIndex: i + 1, dayName: day.dayName, date: day.date, nextDate: day.nextDate,
        roomOnly: formatted('roomOnly'),
        roomOnlyFlexible: formatted('roomOnlyFlexible'),
        breakfast: formatted('breakfast'),
        breakfastFlexible: formatted('breakfastFlexible'),
        halfBoard: formatted('halfBoard'),
        halfBoardFlexible: formatted('halfBoardFlexible'),
        originalPrices: {
          breakfast: formattedOrig('breakfast'),
          breakfastFlexible: formattedOrig('breakfastFlexible'),
          halfBoard: formattedOrig('halfBoard'),
          halfBoardFlexible: formattedOrig('halfBoardFlexible'),
          roomOnly: formattedOrig('roomOnly'),
          roomOnlyFlexible: formattedOrig('roomOnlyFlexible'),
        },
        rawPrices: {
          breakfast: formattedRaw('breakfast'),
          breakfastFlexible: formattedRaw('breakfastFlexible'),
          halfBoard: formattedRaw('halfBoard'),
          halfBoardFlexible: formattedRaw('halfBoardFlexible'),
          roomOnly: formattedRaw('roomOnly'),
          roomOnlyFlexible: formattedRaw('roomOnlyFlexible'),
        },
        rawOriginalPrices: {
          breakfast: formattedRawOrig('breakfast'),
          breakfastFlexible: formattedRawOrig('breakfastFlexible'),
          halfBoard: formattedRawOrig('halfBoard'),
          halfBoardFlexible: formattedRawOrig('halfBoardFlexible'),
          roomOnly: formattedRawOrig('roomOnly'),
          roomOnlyFlexible: formattedRawOrig('roomOnlyFlexible'),
        },
        breakfastDiff: pBfDiff,
        rawBreakfastDiff: rBfDiff,
        dayStatus: day.status, error: day.error, offers: day.offers,
      };
    });
    return { ...details, hotelInput, checkIn, checkOut, nights, adults, rooms, childAges, roomName, roomKeywords, bedCount, bedType, mealPlan, fetchedAt: new Date().toISOString(), rows };
  };
}
export const fetchDailyPricesAlmatar = createDailyPricesFetcher();
