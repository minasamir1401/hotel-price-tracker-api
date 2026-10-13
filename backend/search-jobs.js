import {randomUUID} from 'node:crypto';
import {datePairs} from './scrapers/almosafer-live.js';

// A browser disconnect cannot cancel a paid month-long search. Completed jobs
// remain available briefly; server restarts intentionally do not claim success.
export function createSearchJobs({execute,now=Date.now,maxActive=2,ttlMs=1800000}={}) {
  const jobs=new Map();
  function prune() {
    for(const [id,j] of jobs) if(j.status!=='running' && now()-j.updatedAt>ttlMs) jobs.delete(id);
  }
  const snapshot=j=>({id:j.id,status:j.status,progress:j.progress,result:j.result,error:j.error,createdAt:j.createdAt});
  return {
    start(input) {
      prune();
      let nights;
      try { nights=datePairs(input.checkIn,input.checkOut).length; }
      catch (error) { error.status=400; throw error; }
      if(!String(input.hotelInput||'').trim() || String(input.hotelInput).length>6000) throw Object.assign(new Error('أدخل رابط الفندق'),{status:400});
      if(!Array.isArray(input.sources)||!input.sources.length||input.sources.some(s=>!['almosafer','almatar','booking','nusuk'].includes(s))) throw Object.assign(new Error('مصادر البحث غير صالحة'),{status:400});
      const {requestId,...query}=input;
      if(requestId!==undefined && !/^[a-f0-9-]{36}$/i.test(requestId)) throw Object.assign(new Error('معرّف طلب البحث غير صالح'),{status:400});
      const key=JSON.stringify(query);
      const existing=[...jobs.values()].find(j=>j.key===key && (j.status==='running'||(j.status==='completed' &&
        (requestId!==undefined ? j.requestIds.has(requestId) : now()-j.updatedAt<120000))));
      if(existing){existing.requestIds.add(requestId);return snapshot(existing);}
      if([...jobs.values()].filter(j=>j.status==='running').length>=maxActive) throw Object.assign(new Error('هناك مهمتان قيد التنفيذ؛ انتظر انتهاء إحداهما لتقليل تكلفة الاتصال'),{status:429});
      if(jobs.size>=100) {
        const oldest=[...jobs.values()].find(j=>j.status!=='running');
        if(oldest)jobs.delete(oldest.id);
      }
      const j={id:randomUUID(),key,requestIds:new Set([requestId]),status:'running',createdAt:now(),updatedAt:now(),progress:{completed:0,total:nights,percent:0},result:null,error:null};
      jobs.set(j.id,j);
      Promise.resolve().then(()=>execute({...query,onProgress:p=>{
        j.progress={...p,percent:p.percent ?? (p.total>0 ? Math.round(p.completed/p.total*100) : 0)};
        j.updatedAt=now();
      }})).then(result=>{
        j.result=result;j.status=result.success===false?'failed':'completed';
        if(j.status==='failed')j.error={message:result.message||result.error||'فشل الاستعلام',code:result.code,diagnosticId:result.diagnosticId};
      }).catch(error=>{
        j.status='failed';j.error={message:error.message||'فشل الاستعلام',code:error.code,diagnosticId:error.diagnosticId};
      }).finally(()=>{j.updatedAt=now();});
      return snapshot(j);
    },
    get(id) {prune(); const job=jobs.get(id);return job?snapshot(job):null;},
  };
}
