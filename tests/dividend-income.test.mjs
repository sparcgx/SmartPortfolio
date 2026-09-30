import test from 'node:test';
import assert from 'node:assert/strict';
import { dividendIncome as calc } from '../src/dividend-income.ts';
const tx={id:'d1',type:'DIVIDEND',category:'台股',symbol:'ETF',name:'股息測試',date:'2026-09-01',amount:100,fee:2,tax:3,costsVerified:true};
const h={category:'台股',symbol:'ETF',name:'股息測試',shares:100,currentPrice:20,divRate:6,estDivMonth:'3,6,9,12'};
const report=(rows,year=2026,month=0,currency='TWD',today='2026-09-30')=>calc([h],rows,year,month,currency,today);
test('gross, fee, tax and net aggregate by transaction, including closed holdings',()=>{
 const r=calc([], [tx,{...tx,id:'d2',amount:200,costsVerified:false}],2026,9,'TWD','2026-09-30');assert.equal(r.total.gross,300);assert.equal(r.total.net,290);assert.equal(r.total.costs,10);assert.equal(r.total.unverified,1);assert.equal(r.ranking[0].count,2);assert.equal(r.monthly[8].net,290);
});
test('native currencies and same-symbol categories never mix',()=>{
 const rows=[tx,{...tx,id:'us',category:'美股',amount:10},{...tx,id:'fund',category:'公募基金'}];
 assert.equal(report(rows).ranking.length,2);assert.equal(report(rows).total.net,190);assert.equal(report(rows,2026,0,'USD').total.net,5);
});
test('forecast is gross current holdings only, with unique payment months',()=>{
 const r=report([tx]);assert.equal(r.forecast,120);assert.equal(r.monthly[8].forecast,30);assert.equal(report([tx],2025).forecast,null);
 const v=calc([{...h,estDivMonth:'9,9,13,0'}],[],2026,9,'TWD','2026-09-30');assert.equal(v.forecast,120);
});
test('year-to-date compares equal cutoff and clamps leap-day',()=>{
 const rows=[{...tx,date:'2024-02-29'},{...tx,id:'p',date:'2023-02-28',amount:50},{...tx,id:'later',date:'2023-03-01',amount:999}];
 const r=report(rows,2024,0,'TWD','2024-02-29');assert.equal(r.previous.net,45);assert.equal(r.total.net,95);assert.equal(r.comparison.difference,50);
});
test('missing records and zero/negative prior base do not create growth percentages',()=>{
 assert.equal(report([tx]).comparison,null);
 const r=report([tx,{...tx,id:'p',date:'2025-09-01',amount:5}]);assert.equal(r.previous.net,0);assert.equal(r.comparison.percent,null);
});
test('invalid dates, invalid amount and future rows excluded without mutating source',()=>{
 const rows=[tx,{...tx,id:'bad',amount:NaN},{...tx,id:'day',date:'2026-02-30'},{...tx,id:'future',date:'2026-12-01'}];const before=structuredClone(rows);const r=report(rows);assert.equal(r.total.count,1);assert.equal(r.invalidCount,2);assert.deepEqual(rows,before);assert.equal(r.monthly[11].count,0);
});
test('editing or removing source immediately changes totals and ranking',()=>{
 assert.equal(report([tx]).total.net,95);assert.equal(report([{...tx,amount:300}]).total.net,295);assert.equal(report([]).total.net,0);assert.equal(report([]).ranking.length,0);
});
test('month selection filters ranking and prior-year comparison consistently',()=>{
 const r=report([tx,{...tx,id:'a',date:'2026-08-01',amount:999},{...tx,id:'p',date:'2025-09-01',amount:80}],2026,9);assert.equal(r.total.net,95);assert.equal(r.previous.net,75);assert.equal(r.rows.length,1);assert.equal(r.ranking[0].net,95);
});
