import { scrapeAlmosafer } from './almosafer.js';
import { scrapeAlmatar } from './almatar.js';
import { scrapeBooking } from './booking.js';
import { datePairs } from './almosafer-live.js';
import { roundMoney } from './enigma.js';
import { recordSourceSuccess, recordSourceFailure } from './source-status.js';

const plans = ['roomOnly','breakfast','halfBoard'];
export function buildComparison(searchParams, allRooms, warnings = []) {
  const pairs = datePairs(searchParams.checkIn, searchParams.checkOut);
  const adults = Number(searchParams.adults || 2), rooms = Number(searchParams.rooms || 1);
  const selectedRoomName = searchParams.roomName || searchParams.roomKeywords?.[0];
  let match = null;
  if (selectedRoomName) {
    match = allRooms.find(r => r.roomName && (r.roomName === selectedRoomName || r.roomName.includes(selectedRoomName)));
  }
  if (!match) {
    match = allRooms.find(r => r.capacityAdults === adults) || allRooms[0];
  }
  if (!allRooms.length) return { success:true, data:[], summary:null, warnings };
  const dayNames = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  const dailyBreakdown = pairs.map((dp,i) => {
    const day = match?.dailyRates.find(d=>d.date===dp.date);
    const d = {
      dayNumber:i+1,
      dayTitle:`اليوم ${i+1}`,
      date:dp.date,
      dayOfWeek:dayNames[dp.day],
      isWeekend:dp.day===5||dp.day===6,
      capacityAdults:adults,
      hasAlmosafer:match?.source==='Almosafer',
      hasAlmatar:match?.source==='Almatar',
      almosaferRoom:match?.roomName,
      almosaferAvailability:day?.availability || 'unavailable',
      almosaferError:day?.error || null,
      almosaferCancellation:day?.cancellationPolicy || 'غير متاح',
      almosaferOffers:day?.offers || {},
      isAlternative:day?.isAlternative || false,
      alternativeRoomName:day?.alternativeRoomName || null,
      currency:'SAR',
      currencyArabic:'ر.س'
    };
    for(const plan of plans) {
      const title=plan[0].toUpperCase()+plan.slice(1);
      d[`almosafer${title}`]=day?.[`${plan}Price`] ?? null;
      d[`almosafer${title}Flexible`]=day?.[`${plan}FlexiblePrice`] ?? null;
      d[`almosafer${title}IsAlternative`]=day?.[`${plan}IsAlternative`] || false;
    }
    for (const plan of ['Breakfast','HalfBoard']) {
      const price=d[`almosafer${plan}`], ro=d.almosaferRoomOnly;
      const diff = (price !== null && ro !== null) ? roundMoney(price - ro) : (plan === 'Breakfast' && price !== null && ro === null ? 0 : (plan === 'HalfBoard' && price !== null && d.almosaferBreakfast !== null ? roundMoney(price - d.almosaferBreakfast) : null));
      d[`almosafer${plan}MealDiff`]=diff;
      d[`almosafer${plan}PerPerson`]=diff===null?null:roundMoney(diff/adults);
    }
    return d;
  });
  const summary = {hotelName:match.hotelName,checkIn:searchParams.checkIn,checkOut:searchParams.checkOut,nights:pairs.length,adults,children:Number(searchParams.children || 0),rooms,totalRoomsCount:allRooms.length,searchedAt:match.lastUpdated,dailyBreakdown,currency:'SAR',currencyArabic:'ر.س',activeRoomCategory:match.roomCategory,almosaferRoom:match.roomName,almosaferCancellation:match.cancellationPolicy,almosaferCancellationLowest:match.cancellationPolicyLowest,almosaferCancellationFlexible:match.cancellationPolicyFlexible,pricingMethod:match.pricingMethod,warnings};
  summary.source=match.source;summary.sourceArabic=match.sourceArabic;summary.mealPlanLabels=match.mealPlanLabels;
  for(const plan of [...plans,...plans.map(p=>`${p}Flexible`)]) {
    const title=plan[0].toUpperCase()+plan.slice(1);
    summary[`almosafer${title}`]=match[`${plan}TotalPrice`];
    summary[`almosafer${title}PerNight`]=match[`${plan}PricePerNight`];
    summary[`almosafer${title}AvailableNights`]=match[`${plan}AvailableNights`];
  }
  return {success:true,data:allRooms,summary,warnings};
}

export async function executeHotelComparison(searchParams, engines={almosafer:scrapeAlmosafer,almatar:scrapeAlmatar,booking:scrapeBooking}) {
  const sources=searchParams.sources || ['almosafer'];
  const warnings=[];
  let allRooms=[];
  const selected=sources.filter(source=>engines[source]);
  if (!selected.length || selected.length !== sources.length) { const error = new Error('مصادر البحث غير صالحة'); error.status = 400; throw error; }
  const outcomes=await Promise.allSettled(selected.map(source=>engines[source](searchParams)));
  for(let i=0;i<outcomes.length;i++) {
    const outcome=outcomes[i];
    if(outcome.status==='fulfilled'){recordSourceSuccess(selected[i]);allRooms.push(...outcome.value);warnings.push(...(outcome.value.filterWarnings || []));}
    else { recordSourceFailure(selected[i], outcome.reason); warnings.push(`${({almatar:'المطار',almosafer:'المسافر',booking:'بوكينج'})[selected[i]] || selected[i]}: ${outcome.reason.message}`); }
  }
  if(outcomes.length&&outcomes.every(x=>x.status==='rejected')) { const error = outcomes[0].reason; error.message = warnings.join(' • '); throw error; }
  for(const room of allRooms) for(const warning of room.warnings || []) {
    const text=`${warning.date}: ${warning.message}`;
    if(!warnings.includes(text)) warnings.push(text);
  }
  return buildComparison(searchParams,allRooms,warnings);
}

