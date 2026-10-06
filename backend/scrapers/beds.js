const digits=text=>String(text || '').replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[\u200e\u200f]/g,'').toLowerCase();
export function readBedOptions(room) {
  const label=room.rmsDetail?.locale?.ar?.bedding || room.rmsDetail?.locale?.en?.bedding || room.bedding || '';
  const readPart=part=>{
    const type=/كينج|king/.test(part)?'king':/كوين|queen/.test(part)?'queen':/مزدوج|double/.test(part)?'double':/فردي|مفرد|single|twin/.test(part)?'single':null;
    const number=part.match(/\d+/)?.[0];
    const count=number?Number(number):/\btwo\b|سريرين/.test(part)?2:/\bthree\b|ثلاثة/.test(part)?3:/\bfour\b|أربعة/.test(part)?4:/\bone\b/.test(part)?1:null;
    return {count,type};
  };
  const options=digits(label).split(/\s*(?:\/|\bor\b|أو)\s*/).map(part=>{
    const pieces=part.split(/\s*(?:\band\b|&|\+|\sو(?=\s|\d))\s*/).map(readPart);
    if(pieces.length===1)return pieces[0];
    // Combined beds are one arrangement; alternatives are separate arrangements.
    const sameType=pieces.every(p=>p.type===pieces[0].type);
    return {count:pieces.every(p=>p.count)?pieces.reduce((sum,p)=>sum+p.count,0):null,type:pieces.every(p=>p.type)?(sameType?pieces[0].type:'mixed'):null,...(!sameType?{parts:pieces}:{})};
  }).filter(o=>o.count || o.type);
  return {label:label || null,options};
}
export function validateBedFilter(params) {
  const count=Number(params.bedCount || 0),type=params.bedType || 'any';
  if(!Number.isInteger(count)||count<0||count>8||!['any','single','double','king','queen'].includes(type))throw new Error('اختيار عدد أو نوع السراير غير صالح');
  return {count,type,active:count>0||type!=='any',includeUnknown:params.includeUnknownBeds===true};
}
export function matchBeds(beds,filter) {
  if(!filter.active)return 'not-requested';
  if(!beds.length)return 'unknown';
  const statuses=beds.map(bed=>{
    if(bed.options.some(o=>(!filter.count||o.count===filter.count)&&(filter.type==='any'||o.type===filter.type)))return 'matched';
    if(!bed.options.length||bed.options.some(o=>(filter.count&&!o.count)||(filter.type!=='any'&&!o.type)))return 'unknown';
    return 'mismatch';
  });
  return statuses.includes('mismatch')?'mismatch':statuses.includes('unknown')?'unknown':'matched';
}
