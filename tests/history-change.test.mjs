import test from 'node:test';
import assert from 'node:assert/strict';
import { assessHistoryChange } from '../src/accounting.ts';
const buy = {id:'b',symbol:'0050',name:'ETF',category:'台股',type:'BUY',date:'2026-01-01',shares:10,price:50};
const sell = {...buy,id:'s',type:'SELL',date:'2026-02-01',shares:4,price:60};
const holding = {id:'h',symbol:'0050',category:'台股',shares:6,avgPrice:50,currentPrice:70,quoteCheckedAt:'2026-09-29'};
const run = (replacement, rows=[sell,buy], assets=[holding], id='b') => assessHistoryChange(assets,rows,id,replacement,'2026-09-29');
test('edit historical purchase recalculates cost and preserves live quote',()=>{
 const result=run({...buy,price:80}); assert.equal(result.error,null); assert.equal(result.after.avgPrice,80); assert.equal(result.after.shares,6);
 assert.equal(result.holdings[0].currentPrice,70); assert.equal(result.holdings[0].quoteCheckedAt,holding.quoteCheckedAt); assert.equal(buy.price,50);
});
test('deleting sale restores shares, deleting supporting buy blocks oversell',()=>{
 assert.equal(run(null,[sell,buy],[holding],'s').after.shares,10);
 assert.match(run(null).error,/不足/);
});
test('moving purchase after sale blocks historical oversell',()=>assert.match(run({...buy,date:'2026-03-01'}).error,/不足/));
test('inconsistent, missing and duplicate holdings are protected',()=>{
 assert.match(run({...buy,price:80},[sell,buy],[{...holding,shares:9}]).error,/不一致/);
 assert.match(run(null,[sell,buy],[]).error,/唯一/);
 assert.match(run(null,[sell,buy],[holding,{...holding,id:'h2'}]).error,/唯一/);
});
test('same-day order stays stable and final buy deletion leaves zero position',()=>{
 const sameDay={...sell,date:buy.date}; assert.equal(run({...buy,shares:12},[sameDay,buy]).after.shares,8);
 assert.deepEqual(run(null,[buy],[{...holding,shares:10}]).after,{shares:0,avgPrice:0});
});
test('dividend edits and deletes do not require or alter holdings',()=>{
 const dividend={...buy,id:'d',type:'DIVIDEND',amount:80};
 const result=run({...dividend,amount:100},[dividend],[],'d'); assert.equal(result.error,null); assert.deepEqual(result.holdings,[]); assert.equal(result.transactions[0].amount,100);
 assert.equal(run(null,[dividend],[],'d').transactions.length,0);
});
test('invalid fields, future dates, changed identity and duplicate IDs block',()=>{
 for(const update of [{date:'2026-02-30'},{date:'2027-01-01'},{shares:NaN},{price:0},{fee:-1},{tax:Infinity},{symbol:'OTHER'},{type:'SELL'}]) assert.ok(run({...buy,...update}).error);
 assert.ok(run(null,[buy,buy]).error);
});
test('fees are retained separately and other assets are untouched',()=>{
 const other={...holding,id:'u',symbol:'AAPL',category:'美股'};
 const result=run({...buy,fee:30,tax:5},[sell,buy],[holding,other]);
 assert.equal(result.after.avgPrice,50); assert.equal(result.transactions[1].fee,30); assert.equal(result.holdings[1],other);
});
test('H09 quantity and cost mismatch blocks both edit and delete',()=>{
 for (const change of [{shares:7},{avgPrice:55},{shares:NaN},{avgPrice:NaN},{shares:Infinity}]) {
  for (const replacement of [null,{...buy,price:80}]) {
   const assets=[{...holding,...change}]; const result=run(replacement,[sell,buy],assets);
   assert.match(result.error,/對帳未通過/); assert.equal(result.holdings,assets); assert.deepEqual(result.transactions,[sell,buy]);
  }
 }
});
test('H09 current quote change alone is not an accounting mismatch',()=>{
 assert.equal(run({...buy,price:80},[sell,buy],[{...holding,currentPrice:100}]).error,null);
});
