import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const hooks=registerHooks({resolve(s,c,n){if(s==='./accounting'&&c.parentURL?.endsWith('/performance.ts'))return n('./accounting.ts',c);return n(s,c);}});
const {investmentPerformance:calc}=await import('../src/performance.ts');hooks.deregister();
const buy={id:'b',symbol:'ETF',name:'測試',category:'台股',type:'BUY',date:'2025-01-01',shares:10,price:100,fee:10,tax:0,costsVerified:true};
const sell={...buy,id:'s',type:'SELL',date:'2026-01-01',shares:4,price:120,fee:2,tax:3};
const div={...buy,id:'d',type:'DIVIDEND',date:'2026-02-01',amount:30,fee:1,tax:2};
const h={symbol:'ETF',name:'測試',category:'台股',shares:6,avgPrice:100,currentPrice:130};
test('partial sale allocates purchase fees; dividend net and annual attribution',()=>{
 const r=calc([h],[div,sell,buy],32)[0];assert.equal(r.error,null);assert.equal(r.realized,71);assert.equal(r.dividends,27);assert.equal(r.cost,606);assert.equal(r.unrealized,174);assert.equal(r.total,272);assert.equal(r.twdTotal,272);assert.equal(r.returnRate,272/1010*100);assert.deepEqual(r.annual['2026'],{realized:71,dividends:27});assert.equal(r.verified,true);
});
test('full liquidation and repurchase resets remaining fee-inclusive cost',()=>{
 const sale={...sell,shares:10};const repurchase={...buy,id:'b2',date:'2026-03-01',shares:2,price:200,fee:5};
 const r=calc([{...h,shares:2,avgPrice:200,currentPrice:210}],[repurchase,sale,buy],32)[0];assert.equal(r.realized,185);assert.equal(r.cost,405);assert.equal(r.unrealized,15);
});
test('USD performance includes historical FX; missing FX is never substituted',()=>{
 const rows=[{...sell,category:'美股',fxRate:32},{...buy,category:'美股',fxRate:30}];
 const r=calc([{...h,category:'美股'}],rows,33)[0];assert.equal(r.total,245);assert.equal(r.twdTotal,10640);
 assert.equal(calc([{...h,category:'美股'}],[rows[0],{...rows[1],fxRate:undefined}],33)[0].twdTotal,null);
});
test('unaligned holdings and overselling withhold performance',()=>{
 assert.ok(calc([{...h,shares:7}],[sell,buy],32)[0].error);
 assert.ok(calc([h],[{...sell,shares:11},buy],32)[0].error);
});
test('legacy fees remain unverified and closed position needs no holding',()=>{
 const r=calc([],[{...sell,shares:10},{...buy,costsVerified:undefined}],32)[0];assert.equal(r.error,null);assert.equal(r.verified,false);assert.equal(r.unrealized,0);
});
test('same-day original entry order and currency groups remain independent',()=>{
 const r=calc([h],[{...sell,date:buy.date},buy],32)[0];assert.equal(r.error,null);
 const all=calc([h,{...h,category:'美股'}],[sell,buy,{...sell,category:'美股'},{...buy,category:'美股'}],32);assert.equal(all.length,2);
});
