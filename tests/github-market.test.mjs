import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import {fetchMarketSnapshot} from '../src/market-data.ts';
const endpoint='https://smartportfolio.sparcgx2420.chatgpt.site/api/market-data';
const origin='https://sparcgx.github.io';
const request=(instruments=[],headers={})=>new Request(endpoint,{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify({instruments})});
test('GitHub preflight permits JSON POST and rejects unrelated origins or headers',async()=>{
 const opts={method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'content-type'}};
 let r=await worker.fetch(new Request(endpoint,opts));assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),origin);
 r=await worker.fetch(new Request(endpoint,{...opts,headers:{...opts.headers,origin:'https://evil.test'}}));assert.equal(r.status,403);assert.equal(r.headers.get('access-control-allow-origin'),null);
 r=await worker.fetch(new Request(endpoint,{...opts,headers:{...opts.headers,'access-control-request-headers':'authorization'}}));assert.equal(r.status,403);
});
test('Taiwan, US and FX share CORS snapshot; repeated query reuses short cache',async()=>{
 const old=globalThis.fetch;let calls=0;
 globalThis.fetch=async input=>{calls++;const u=String(input);if(u.includes('frankfurter'))return Response.json({rate:31.5,date:'2026-09-30'});if(u.includes('twse'))return Response.json({msgArray:[{c:'00919',z:'25',y:'24',d:'20260930',t:'13:30:00',tlong:Date.now()}]});if(u.includes('nasdaq'))return Response.json({data:{primaryData:{lastSalePrice:'$230',isRealTime:false,lastTradeTimestamp:'Sep 29, 2026 4:00 PM ET'}}});throw Error('unexpected');};
 try {const instruments=[{category:'台股',symbol:'00919'},{category:'美股',symbol:'MSFT'}];const r=await worker.fetch(request(instruments));assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),origin);const data=await r.json();assert.equal(data.fx.rate,31.5);assert.equal(data.quotes.find(q=>q.symbol==='00919').price,25);assert.equal(data.quotes.find(q=>q.symbol==='MSFT').price,230);assert.deepEqual(data.errors,[]);const count=calls;const cached=await (await worker.fetch(request(instruments))).json();assert.equal(calls,count);assert.equal(cached.fetchedAt,data.fetchedAt);}finally{globalThis.fetch=old;}
});
test('upstream outage returns partial errors with CORS and does not invent prices',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>{throw Error('offline');};
 try {const r=await worker.fetch(request([{category:'台股',symbol:'00918'},{category:'美股',symbol:'GOOG'}]));const data=await r.json();assert.equal(r.headers.get('access-control-allow-origin'),origin);assert.equal(data.fx,null);assert.deepEqual(data.quotes,[]);assert.ok(data.errors.length>=3);}finally{globalThis.fetch=old;}
});
test('invalid payload and isolate request throttle retain CORS on errors',async()=>{
 let r=await worker.fetch(request([null]));assert.equal(r.status,400);assert.equal(r.headers.get('access-control-allow-origin'),origin);
 const old=globalThis.fetch;globalThis.fetch=async()=>{throw Error('offline');};
 try {for(let i=0;i<16;i++)r=await worker.fetch(request([],{'cf-connecting-ip':'192.0.2.7'}));assert.equal(r.status,429);assert.equal(r.headers.get('access-control-allow-origin'),origin);}finally{globalThis.fetch=old;}
});
test('GitHub client selects absolute API and omits credentials; offline and malformed data reject',async()=>{
 const old=globalThis.fetch;globalThis.window={location:{hostname:'sparcgx.github.io'}};
 globalThis.fetch=async(url,options)=>{assert.equal(url,endpoint);assert.equal(options.credentials,'omit');assert.deepEqual(JSON.parse(options.body),{instruments:[]});return Response.json({fetchedAt:'2026-09-30',fx:null,quotes:[],errors:[]});};
 try {await fetchMarketSnapshot([]);globalThis.fetch=async()=>Response.json({});await assert.rejects(fetchMarketSnapshot([]),/格式/);globalThis.fetch=async()=>{throw new TypeError('Failed to fetch');};await assert.rejects(fetchMarketSnapshot([]),/Failed to fetch/);}finally{globalThis.fetch=old;delete globalThis.window;}
});

test('offline device skips request; aborted connection remains a failure',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');const old=globalThis.fetch;
 try {Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:false}});globalThis.fetch=async()=>{throw Error('should not fetch');};await assert.rejects(fetchMarketSnapshot([]),/離線/);
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});globalThis.fetch=async()=>{throw new DOMException('timeout','AbortError');};await assert.rejects(fetchMarketSnapshot([]),{name:'AbortError'});
 }finally{globalThis.fetch=old;if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;}
});
