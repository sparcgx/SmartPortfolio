import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYieldPercent, yieldDataDate, parseTaiwanYield, parseNasdaqYield, fetchOfficialYields } from '../server/dividend-yields.mjs';
import { validateOfficialYield, mergeOfficialYield, fetchDividendYields } from '../src/official-yields.ts';
import worker from '../dist/server/index.js';
const now='2026-10-02T00:00:00Z';
const row={Date:'20261001',Code:'2330',DividendYield:'2.35'};
const sample=parseTaiwanYield([row],'2330','TWSE',now);
test('official values use strict numeric parsing; missing never becomes zero',()=>{
 for(const input of ['','N/A','--','about 3%','-2%',NaN,Infinity,null])assert.equal(parseYieldPercent(input),null);
 assert.equal(parseYieldPercent('0.00%'),0);assert.equal(parseYieldPercent('2.35'),2.35);
 assert.equal(yieldDataDate('1151001'),'2026-10-01');assert.equal(yieldDataDate('20260230'),null);
});
test('Taiwan sources use their exact code fields, original date and yield methodology',()=>{
 assert.equal(sample.rate,2.35);assert.equal(sample.asOf,'2026-10-01');assert.match(sample.basis,/股票股利/);
 assert.equal(parseTaiwanYield([row],'233','TWSE',now),null);
 const otc=parseTaiwanYield([{Date:'1151001',SecuritiesCompanyCode:'1240',YieldRatio:'0.92'}],'1240','TPEx',now);assert.equal(otc.rate,.92);assert.equal(otc.asOf,'2026-10-01');
 assert.equal(parseTaiwanYield([{...row,DividendYield:''}],'2330','TWSE',now).status,'unavailable');
 assert.throws(()=>parseTaiwanYield([{...row,Date:'bad'}],'2330','TWSE',now));
});
test('Nasdaq Current Yield retains published percent and never fabricates a data date',()=>{
 const payload={data:{symbol:'AAPL',assetClass:'STOCKS',summaryData:{Yield:{value:'0.32%'}}}};
 const r=parseNasdaqYield(payload,'AAPL',now);assert.equal(r.rate,.32);assert.equal(r.asOf,null);assert.match(r.basis,/依頻率年化/);
 assert.throws(()=>parseNasdaqYield(payload,'MSFT',now));
 assert.equal(parseNasdaqYield({data:{symbol:'VYM',assetClass:'ETF',summaryData:{}}},'VYM',now).rate,null);
});
test('ETF and fund gaps are explicit and never guessed from last payout',async()=>{
 const r=await fetchOfficialYields([{category:'台股',symbol:'0050'},{category:'公募基金',symbol:'AT'}],now,()=>{throw Error('should not fetch')});
 assert.equal(r.yields.length,2);assert.ok(r.yields.every(i=>i.rate===null&&i.status==='unavailable'));
 assert.match(r.yields[0].sourceUrl,/0050/);assert.match(r.yields[0].message,/年化/);
});
test('partial upstream failure retains successful official source and marks missing result as error',async()=>{
 const fetcher=async url=>{if(url.includes('openapi.twse'))return[row];throw Error('offline');};
 const result=await fetchOfficialYields([{category:'台股',symbol:'2330'},{category:'台股',symbol:'1240'}],now,fetcher);
 assert.equal(result.yields[0].rate,2.35);assert.equal(result.yields[1].status,'error');assert.equal(result.errors.length,1);
 const previous=sample;const failed={...sample,status:'error',rate:null,checkedAt:'2026-10-03T00:00:00Z',message:'offline'};
 const kept=mergeOfficialYield(previous,failed);assert.equal(kept.rate,2.35);assert.equal(kept.checkedAt,now);
 assert.equal(mergeOfficialYield(previous,{...sample,rate:9,asOf:'2026-09-01'}).rate,2.35);
});
test('official metadata rejects unsafe links and malformed numbers before restore/display',()=>{
 assert.deepEqual(validateOfficialYield(sample),sample);
 assert.equal(validateOfficialYield({...sample,sourceUrl:'javascript:alert(1)'}),undefined);
 assert.equal(validateOfficialYield({...sample,sourceUrl:'https://evil.test/'}),undefined);
 assert.equal(validateOfficialYield({...sample,rate:NaN}),undefined);
});
test('GitHub yield client sends only identifiers and rejects incorrect/missing records',async()=>{
 const old=globalThis.fetch;globalThis.window={location:{hostname:'sparcgx.github.io'}};
 try {
  globalThis.fetch=async(url,options)=>{assert.match(url,/chatgpt.site\/api\/dividend-yields$/);assert.equal(options.credentials,'omit');assert.deepEqual(JSON.parse(options.body),{instruments:[{category:'台股',symbol:'2330'}]});return Response.json({yields:[{...sample,category:'台股',symbol:'2330'}]});};
  const r=await fetchDividendYields([{category:'台股',symbol:'2330',shares:99,avgPrice:20},{category:'公募基金',symbol:'自訂基金'}]);assert.equal(r.find(i=>i.symbol==='2330').rate,2.35);assert.equal(r.find(i=>i.category==='公募基金').status,'unavailable');
  globalThis.fetch=async()=>Response.json({yields:[]});await assert.rejects(fetchDividendYields([{category:'台股',symbol:'2330'}]));
 }finally{globalThis.fetch=old;delete globalThis.window;}
});
test('yield API shares protected CORS, validates symbols, caches original query time',async()=>{
 const url='https://smartportfolio.sparcgx2420.chatgpt.site/api/dividend-yields';const origin='https://sparcgx.github.io';
 const request=(instruments,extra={})=>new Request(url,{method:'POST',headers:{origin,'content-type':'application/json',...extra},body:JSON.stringify({instruments})});
 let response=await worker.fetch(new Request(url,{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST'}}));assert.equal(response.status,204);
 response=await worker.fetch(request([{category:'台股',symbol:'../../bad'}]));assert.equal(response.status,400);
 response=await worker.fetch(request([],{origin:'https://evil.test'}));assert.equal(response.status,403);
 const old=globalThis.fetch;let calls=0;globalThis.fetch=async url=>{calls++;return Response.json(String(url).includes('openapi.twse')?[row]:[]);};
 try {
  response=await worker.fetch(request([{category:'台股',symbol:'2330'}]));assert.equal(response.headers.get('access-control-allow-origin'),origin);const first=await response.json();assert.equal(first.yields[0].rate,2.35);
  const count=calls;const again=await(await worker.fetch(request([{category:'台股',symbol:'2330'}]))).json();assert.equal(calls,count);assert.equal(again.fetchedAt,first.fetchedAt);
 }finally{globalThis.fetch=old;}
});
