import { roundMoney } from './enigma.js';
import {validateBedFilter,matchBeds} from './beds.js';
import { almosaferConnection } from './almosafer-connection.js';
import { roomNameMatches } from './arabic-norm.js';
import { forEachNight, fatalInventoryError } from './night-workers.js';
import { roomInventoryStore } from '../room-inventory.js';

function filterRooms(result, bedFilter) {
  const rated = result.map(room => ({ ...room, requestedBeds: bedFilter, bedFilterStatus: matchBeds(room.beds, bedFilter) }));
  const filtered = rated.filter(r => r.bedFilterStatus !== 'mismatch' && (r.bedFilterStatus !== 'unknown' || bedFilter.includeUnknown));
  filtered.filterWarnings = [];
  const unknown = rated.filter(r => r.bedFilterStatus === 'unknown').length;
  if (bedFilter.active && unknown && !bedFilter.includeUnknown) filtered.filterWarnings.push(`المصدر لم يحدد السراير في ${unknown} خيارات غرف؛ تم استبعادها من البحث الدقيق. يمكن إظهارها باختيار «إظهار العروض غير محددة السراير».`);
  if (bedFilter.active && !filtered.length) filtered.filterWarnings.push('لا يوجد عرض مؤكد يطابق عدد ونوع السراير المحددين في نتيجة المصدر الحالية.');
  return filtered;
}

export function datePairs(checkIn, checkOut) {
  const start = Date.parse(`${checkIn}T12:00:00Z`);
  const end = Date.parse(`${checkOut}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn || '') || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut || '') || !Number.isFinite(start) || !Number.isFinite(end) || new Date(start).toISOString().slice(0,10) !== checkIn || new Date(end).toISOString().slice(0,10) !== checkOut || end <= start) throw new Error('تواريخ الإقامة غير صالحة');
  const nights = (end - start) / 86400000;
  if (nights > 62) throw new Error('الحد الأقصى للاستعلام اليومي 62 ليلة');
  return Array.from({length:nights}, (_, i) => ({ date: new Date(start + i * 86400000).toISOString().slice(0,10), nextDate: new Date(start + (i+1) * 86400000).toISOString().slice(0,10), day: new Date(start + i * 86400000).getUTCDay() }));
}

export function createLiveScraper(resolveDetails, fetchDay, {source='Almosafer',sourceArabic='المسافر',bookingURL,allowSameNameFallback=true,allowAlternativeFallback=true,repairFailedNights=true,inventoryStore=roomInventoryStore}={}) {
  return async function scrape(params) {
    const { hotelInput, checkIn, checkOut, roomNotes = '', refresh = false } = params;
    const adults = Number(params.adults ?? 2), rooms = Number(params.rooms ?? 1), children = Number(params.children ?? 0);
    if (!Number.isInteger(adults) || adults < 1 || adults > 8 || !Number.isInteger(rooms) || rooms < 1 || rooms > 4) throw new Error('عدد الأفراد أو الغرف غير صالح');
    const childAges = params.childAges || [];
    if (!Number.isInteger(children) || children < 0 || !Array.isArray(childAges) || childAges.length !== children || childAges.some(age => !Number.isInteger(age) || age < 0 || age > 17)) throw new Error('يلزم تحديد أعمار الأطفال للحصول على سعر صحيح');
    const pairs = datePairs(checkIn, checkOut);
    const bedFilter=validateBedFilter(params);
    const inventory = source === 'Almosafer' && params.roomInventoryId && inventoryStore.take(params.roomInventoryId, params);
    if (inventory) {
      params.onProgress?.({ completed: pairs.length, total: pairs.length, percent: 100, source: sourceArabic });
      return filterRooms(inventory, bedFilter);
    }
    const details = await resolveDetails(hotelInput, params);
    if (!details.hotelId) throw new Error(`يرجى إدخال رابط الفندق من ${sourceArabic} لتحديد الفندق بدقة`);
    const maps = [], errors = [], failures = new Map();
    let phase = 'collecting', repairTotal = 0, repairCompleted = 0;
    const fetchNight = async (dp, force, repair = false) => {
      try {
        const value = await fetchDay({
          checkIn: dp.date,
          checkOut: dp.nextDate,
          hotelId: String(details.hotelId),
          ...(details.sourceOrigin ? { sourceOrigin: details.sourceOrigin } : {}),
          ...(details.hotelProfileKey ? { hotelProfileKey: details.hotelProfileKey, countryCode: details.countryCode } : {}),
          roomsInfo: Array.from({ length: rooms }, () => ({ adultsCount: adults, kidsAges: childAges })),
          currency: 'SAR',
        }, { refresh: force, maxAttempts: 1, ...(repair && source === 'Almosafer' ? {freshSession:true} : {}) });
        const old = errors.findIndex(e => e.date === dp.date);
        if (old >= 0) errors.splice(old, 1);
        failures.delete(dp.date);
        return value;
      } catch (error) {
        const old = errors.findIndex(e => e.date === dp.date);
        if (old >= 0) errors.splice(old, 1);
        errors.push({ date: dp.date, message: error.message });
        failures.set(dp.date, error);
        return null;
      }
    };
    const reportProgress = (currentDate) => {
      if (typeof params.onProgress === 'function') {
        const completed = maps.filter(m => m !== undefined).length;
        const percent = phase === 'repairing' ? Math.round(repairCompleted / repairTotal * 100)
          : pairs.length > 0 ? Math.round((completed / pairs.length) * 100) : 0;
        params.onProgress({
          completed,
          total: pairs.length,
          currentDay: currentDate,
          percent,
          source: sourceArabic,
          phase, repairCompleted, repairTotal, unverifiedNights: errors.length,
        });
      }
    };
    reportProgress(pairs[0]?.date);
    const isAlmosafer = source === 'Almosafer';
    const connection = isAlmosafer ? almosaferConnection() : null;
    const isScrapingAnt = connection?.transport === 'scrapingant';
    const remoteBrowser = isAlmosafer && Boolean(connection?.browserEndpoint);
    const concurrency = connection?.concurrency || 8;
    let fatal;
    await forEachNight(pairs, concurrency, async (dp, index) => {
      maps[index] = await fetchNight(dp, refresh);
      fatal ||= [...failures.values()].find(fatalInventoryError);
      reportProgress(dp.date);
    }, () => Boolean(fatal) && !maps.some(map => map !== undefined && map !== null));
    if (fatal) {
      for (let i = 0; i < pairs.length; i++) if (maps[i] === undefined) {
        maps[i] = null; failures.set(pairs[i].date, fatal); errors.push({ date: pairs[i].date, message: fatal.message });
      }
      reportProgress(pairs.at(-1).date);
    }
    // Recheck failed nights with fresh searches; confirmed empty nights are final.
    const repair = pairs.map((dp, i) => ({ dp, i })).filter(({ dp, i }) => {
      if (!repairFailedNights) return false;
      const failure=failures.get(dp.date);
      if (failure?.responseKind === 'challenge' || failure?.stage === 'browser-connect' || [400,401,403,404].includes(failure?.upstreamStatus)) return false;
      // Completed, validated empty inventory is final for every transport.
      return maps[i] === null;
    });
    if (repair.length > 0) {
      phase = 'repairing'; repairTotal = repair.length;
      reportProgress(repair[0].dp.date);
      const REPAIR_BATCH = remoteBrowser ? 1 : (isScrapingAnt ? 2 : 4);
      await forEachNight(repair, REPAIR_BATCH, async ({ dp, i }) => {
        maps[i] = await fetchNight(dp, true, true);
        repairCompleted++;
        reportProgress(dp.date);
      });
    }
    phase = 'completed';
    reportProgress(pairs.at(-1).date);
    if (maps.every(m => m === null)) throw failures.get(errors[0]?.date) || new Error(`تعذر الاتصال بـ${sourceArabic}`);
    const keys = [...new Set(maps.flatMap(m=>Object.keys(m || {})))];
    const dayNames = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
    const fields = ['roomOnly','breakfast','halfBoard','roomOnlyFlexible','breakfastFlexible','halfBoardFlexible'];

    function findBestAlternative(dayMap, sampleRoom) {
      if (!dayMap) return null;
      const candidates = Object.values(dayMap).filter(cand => cand && cand.offers && Object.keys(cand.offers).length > 0);
      if (!candidates.length) return null;
      const sampleBedType = sampleRoom?.beds?.[0]?.options?.[0]?.type;
      const sampleBedCount = sampleRoom?.beds?.[0]?.options?.[0]?.count;

      candidates.sort((a, b) => {
        const aBedType = a.beds?.[0]?.options?.[0]?.type;
        const aBedCount = a.beds?.[0]?.options?.[0]?.count;
        const bBedType = b.beds?.[0]?.options?.[0]?.type;
        const bBedCount = b.beds?.[0]?.options?.[0]?.count;

        const aBedMatch = (sampleBedType && aBedType === sampleBedType ? 3 : 0) + (sampleBedCount && aBedCount === sampleBedCount ? 2 : 0);
        const bBedMatch = (sampleBedType && bBedType === sampleBedType ? 3 : 0) + (sampleBedCount && bBedCount === sampleBedCount ? 2 : 0);
        if (bBedMatch !== aBedMatch) return bBedMatch - aBedMatch;

        const priceA = a.offers.breakfast?.price ?? a.offers.roomOnly?.price ?? a.offers.halfBoard?.price ?? 999999;
        const priceB = b.offers.breakfast?.price ?? b.offers.roomOnly?.price ?? b.offers.halfBoard?.price ?? 999999;
        return priceA - priceB;
      });

      return candidates[0];
    }

    function findSameNameRoom(dayMap, sampleRoom) {
      if (!dayMap || !sampleRoom) return null;
      const candidates = Object.values(dayMap).filter(cand => cand && cand.offers && Object.keys(cand.offers).length > 0 && roomNameMatches(cand.name, sampleRoom.name));
      if (!candidates.length) return null;
      const sampleBedType = sampleRoom?.beds?.[0]?.options?.[0]?.type;
      const sampleBedCount = sampleRoom?.beds?.[0]?.options?.[0]?.count;

      candidates.sort((a, b) => {
        const aBedType = a.beds?.[0]?.options?.[0]?.type;
        const aBedCount = a.beds?.[0]?.options?.[0]?.count;
        const bBedType = b.beds?.[0]?.options?.[0]?.type;
        const bBedCount = b.beds?.[0]?.options?.[0]?.count;

        const aBedMatch = (sampleBedType && aBedType === sampleBedType ? 3 : 0) + (sampleBedCount && aBedCount === sampleBedCount ? 2 : 0);
        const bBedMatch = (sampleBedType && bBedType === sampleBedType ? 3 : 0) + (sampleBedCount && bBedCount === sampleBedCount ? 2 : 0);
        if (bBedMatch !== aBedMatch) return bBedMatch - aBedMatch;

        const priceA = a.offers.breakfast?.price ?? a.offers.roomOnly?.price ?? a.offers.halfBoard?.price ?? 999999;
        const priceB = b.offers.breakfast?.price ?? b.offers.roomOnly?.price ?? b.offers.halfBoard?.price ?? 999999;
        return priceA - priceB;
      });

      return candidates[0];
    }

    const result = keys.map((key, index) => {
      const sample = maps.find(m=>m?.[key])?.[key];
      const dailyRates = pairs.map((dp,i) => {
        let room = maps[i]?.[key];
        if (!room && maps[i] && allowSameNameFallback) {
          room = findSameNameRoom(maps[i], sample);
        }
        const alt = (allowAlternativeFallback && !room && maps[i] && Object.keys(maps[i]).length > 0) ? findBestAlternative(maps[i], sample) : null;
        const d = {
          dayNumber:i+1,
          dayTitle:`اليوم ${i+1}`,
          date:dp.date,
          nextDate:dp.nextDate,
          dayOfWeek:dayNames[dp.day],
          isWeekend:dp.day===5||dp.day===6,
          availability:maps[i]===null?'error':room?'available':alt?'available_alternative':'unavailable',
          error:errors.find(e=>e.date===dp.date)?.message || null,
          offers:room?.offers || alt?.offers || {},
          isAlternative:Boolean(!room && alt),
          alternativeRoomName:alt?.name || null,
          alternativeOffers:alt?.offers || {}
        };
        fields.forEach(field=>{
          const title = field[0].toUpperCase() + field.slice(1);
          d[`${field}Price`]=room?.offers[field]?.price ?? null;
          d[`alternative${title}Price`]=alt?.offers[field]?.price ?? null;
        });
        d.cancellationPolicy = room?.offers.roomOnly?.cancellationPolicy || room?.offers.breakfast?.cancellationPolicy || alt?.offers.breakfast?.cancellationPolicy || 'غير متاح';
        return d;
      });
      const url = new URL(`https://www.almosafer.com/ar/${details.baseSlug}`);
      const dmy = iso => iso.split('-').reverse().join('-');
      url.searchParams.set('checkin',dmy(checkIn));url.searchParams.set('checkout',dmy(checkOut));url.searchParams.set('rooms',Array.from({length:rooms},()=>`${adults}_adult`).join('*'));url.searchParams.set('ncr','1');
      const r = {id:`${source.toLowerCase()}-${details.hotelId}-${index}`,source,sourceArabic,hotelName:details.hotelName,roomName:sample.name,roomType:sample.name,roomCategory:sample.category,capacityAdults:adults,capacityText:`${adults} أفراد`,isExactOccupancyMatch:true,checkIn,checkOut,nights:pairs.length,adults,children,rooms,currency:'SAR',currencyArabic:'ر.س',bookingUrl:url.href,lastUpdated:new Date().toLocaleString('ar-SA'),dailyRates,dataKind:'live',pricingMethod:'independent-single-night-quotes',warnings:errors};
      for (const field of fields) {
        const title = field[0].toUpperCase() + field.slice(1);
        const directPrices = dailyRates.map(d=>d[`${field}Price`]);
        const complete = directPrices.every(p=>p !== null);
        const allPrices = dailyRates.map(d=>d[`${field}Price`] ?? d[`alternative${title}Price`]);
        const fullComplete = allPrices.every(p=>p !== null);

        r[`${field}DirectAvailableNights`] = directPrices.filter(p=>p!==null).length;
        r[`${field}AvailableNights`] = r[`${field}DirectAvailableNights`];
        r[`${field}FullAvailableNights`] = allPrices.filter(p=>p!==null).length;
        
        r[`${field}TotalPrice`] = complete ? roundMoney(directPrices.reduce((s,p)=>s+p,0)*rooms) : null;
        r[`${field}PricePerNight`] = complete ? roundMoney(r[`${field}TotalPrice`]/rooms/pairs.length) : null;
        
        // Full stay price (including real alternative rates if any night is sold out)
        r[`${field}EstimatedTotalPrice`] = fullComplete ? roundMoney(allPrices.reduce((s,p)=>s+p,0)*rooms) : null;
        r[`${field}EstimatedPricePerNight`] = fullComplete ? roundMoney(r[`${field}EstimatedTotalPrice`]/rooms/pairs.length) : null;

        r[`${field}IsDirectComplete`] = complete;
        r[`${field}IsFullComplete`] = fullComplete;
      }
      r.cancellationPolicyLowest = dailyRates.find(d=>d.cancellationPolicy!=='غير متاح')?.cancellationPolicy || 'غير متاح';
      r.roomIdentity = key;
      if(bookingURL)r.bookingUrl=bookingURL(details,{checkIn,checkOut,adults,rooms,childAges});
      r.mealPlanLabels=Object.fromEntries(['roomOnly','breakfast','halfBoard'].map(plan=>[plan,maps.map(m=>m?.[key]?.offers[plan]?.mealLabel).find(Boolean)]).filter(([,label])=>label));
      r.beddingVerified = sample.beddingVerified;
      r.roomSizeM2 = sample.roomSizeM2 ?? null;
      r.roomDescription = sample.roomDescription ?? null;
      r.roomAmenities = sample.roomAmenities || [];
      r.partnerOffer = sample.partnerOffer || false;
      r.beds=sample.beds || [];
      r.beddingLabel=sample.beddingLabel || 'لم يحدد المصدر';
      r.bedFilterStatus=matchBeds(r.beds,bedFilter);
      r.requestedBeds=bedFilter;
      r.originalRoomNames = sample.originalNames;
      r.cancellationPolicyFlexible = dailyRates.some(d=>d.roomOnlyFlexiblePrice!==null||d.breakfastFlexiblePrice!==null) ? 'إلغاء مجاني حسب شروط كل عرض' : 'غير متاح';
      r.cancellationPolicy = r.cancellationPolicyLowest;
      r.hasDualRates = fields.slice(3).some(field=>r[`${field}AvailableNights`]>0);
      r.price=r.roomOnlyTotalPrice ?? r.breakfastTotalPrice;
      r.pricePerNight=r.roomOnlyPricePerNight ?? r.breakfastPricePerNight;
      r.mealPlan=r.breakfastAvailableNights>0?'راجع توفر الوجبات لكل يوم':'إقامة فقط';
      return r;
    });

    // Sort rooms: rooms with 100% direct availability first, then full availability with alternatives, then by price
    result.sort((a,b) => {
      const aComplete = (a.breakfastIsDirectComplete || a.roomOnlyIsDirectComplete || a.halfBoardIsDirectComplete) ? 3 : (a.breakfastIsFullComplete || a.roomOnlyIsFullComplete) ? 2 : 0;
      const bComplete = (b.breakfastIsDirectComplete || b.roomOnlyIsDirectComplete || b.halfBoardIsDirectComplete) ? 3 : (b.breakfastIsFullComplete || b.roomOnlyIsFullComplete) ? 2 : 0;
      if (bComplete !== aComplete) return bComplete - aComplete;

      const directA = Math.max(a.breakfastDirectAvailableNights || 0, a.roomOnlyDirectAvailableNights || 0, a.halfBoardDirectAvailableNights || 0);
      const directB = Math.max(b.breakfastDirectAvailableNights || 0, b.roomOnlyDirectAvailableNights || 0, b.halfBoardDirectAvailableNights || 0);
      if (directB !== directA) return directB - directA;

      const pA = a.pricePerNight ?? 999999;
      const pB = b.pricePerNight ?? 999999;
      return pA - pB;
    });

    // Empty availability and connection failures must be distinguishable.
    if (!result.length && errors.length) throw failures.get(errors[0].date) || new Error(errors[0].message);
    return filterRooms(result, bedFilter);
  };
}
