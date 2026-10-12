import test from 'node:test';
import assert from 'node:assert/strict';
import {createSearchJobs} from '../search-jobs.js';

const month={hotelInput:'https://global.almosafer.com/ar/hotel/details/atg/hotel-1287944',checkIn:'2026-10-20',checkOut:'2026-11-19',sources:['almosafer'],adults:2,rooms:1};
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('A 30-night search is one background job; duplicate submissions share execution and results',async()=>{
  let calls=0,finish;
  const jobs=createSearchJobs({execute:async input=>{
    calls++;
    input.onProgress({completed:12,total:30,percent:40});
    return new Promise(resolve=>{finish=resolve;});
  }});
  const first=jobs.start(month),duplicate=jobs.start({...month});
  assert.equal(first.id,duplicate.id);
  assert.deepEqual(first.progress,{completed:0,total:30,percent:0});
  await flush();
  assert.equal(calls,1);
  assert.equal(jobs.get(first.id).progress.completed,12);
  const result={success:true,data:[{roomName:'Twin',dailyRates:Array.from({length:30},(_,i)=>({day:i+1}))}]};
  finish(result);await flush();
  assert.equal(jobs.get(first.id).status,'completed');
  assert.deepEqual(jobs.get(first.id).result,result);
  assert.equal(jobs.start(month).id,first.id);
  assert.equal(calls,1);
});

test('Jobs reject invalid inputs before paid execution and enforce the active job limit',async()=>{
  let calls=0;
  const jobs=createSearchJobs({maxActive:1,execute:()=>{calls++;return new Promise(()=>{});}});
  for(const change of [{checkIn:'2026-02-30'},{checkOut:'2026-10-19'},{hotelInput:''},{sources:['unknown']}])
    assert.throws(()=>jobs.start({...month,...change}),error=>error.status===400);
  assert.equal(calls,0);
  jobs.start(month);
  assert.throws(()=>jobs.start({...month,hotelInput:'another hotel'}),error=>error.status===429);
  await flush();assert.equal(calls,1);
});

test('Failure diagnostics survive polling and completed jobs expire without running work being cancelled',async()=>{
  let time=0;
  const jobs=createSearchJobs({now:()=>time,ttlMs:100,execute:async()=>{
    throw Object.assign(new Error('Browser connection refused'),{code:'BRIGHTDATA_AUTH_FAILED',diagnosticId:'test-reference'});
  }});
  const job=jobs.start(month);await flush();
  assert.equal(jobs.get(job.id).status,'failed');
  assert.deepEqual(jobs.get(job.id).error,{message:'Browser connection refused',code:'BRIGHTDATA_AUTH_FAILED',diagnosticId:'test-reference'});
  time=101;assert.equal(jobs.get(job.id),null);
  assert.equal(jobs.get('missing'),null);
  const failedResult=createSearchJobs({execute:async()=>({success:false,message:'No valid source response'})});
  const second=failedResult.start(month);await flush();
  assert.equal(failedResult.get(second.id).error.message,'No valid source response');
});
