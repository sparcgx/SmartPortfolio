import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});after(()=>server.close());
const {defaultCashflowTools,parseCashflowTools,cashflowProjection,priceAlertStatus,advancePriceAlerts}=await server.ssrLoadModule('/src/cashflow-tools.ts');
const {parsePortfolioBackup,createPortfolioBackup}=await server.ssrLoadModule('/src/backup.ts');
const {recordSignature}=await server.ssrLoadModule('/src/backup-reminder.ts');
const {default:Goals}=await server.ssrLoadModule('/src/CashflowGoals.tsx');
const {default:Alerts}=await server.ssrLoadModule('/src/PriceAlerts.tsx');
const now=Date.parse('2026-10-02T02:00:00Z');
const h={id:'h1',category:'台股',symbol:'0050',name:'測試 ETF',shares:1000,currentPrice:20,avgPrice:20,divRate:6,sector:'ETF',estDivMonth:'2,8',todayChange:0,quoteMode:'AUTO',quoteSource:'test',quoteCheckedAt:new Date(now).toISOString(),priceUpdatedAt:new Date(now).toISOString(),quoteMarketTimestampKnown:true};
const h2={...h,id:'h2',symbol:'00878',shares:500,currentPrice:30,avgPrice:30,divRate:4};
const a={id:'a1',category:'台股',symbol:'0050',basis:'COST',customPrice:0,tolerancePct:1,enabled:true,inside:false,lastObservation:null,lastTriggeredAt:null};
const div=(id,date,amount,extra={})=>({id,date,amount,type:'DIVIDEND',category:'台股',symbol:'0050',name:'測試 ETF',fee:0,tax:0,...extra});
const settings=()=>({...defaultCashflowTools(),monthlyTargets:{TWD:300,USD:0},plans:[{category:'台股',symbol:'0050',monthlyAmount:6000},{category:'台股',symbol:'00878',monthlyAmount:3000}]});
test('actual income uses 12 complete months, net amounts and original currency',()=>{
 const r=cashflowProjection([h],[div('1','2025-10-01',1200,{fee:10,tax:110}),div('2','2026-09-30',120),div('old','2025-09-30',999),div('current','2026-10-01',999),div('future','2026-12-01',999),div('usd','2026-09-10',999,{category:'美股'})],settings(),'TWD','2026-10-02');
 assert.equal(r.start,'2025-10-01');assert.equal(r.end,'2026-09-30');assert.equal(r.actualNet,1200);assert.equal(r.actualMonthly,100);assert.equal(r.count,2);assert.equal(r.unverified,2);
});
test('multi-instrument contributions calculate fixed-yield gap and rounded-up months without mutation',()=>{
 const list=[h,h2];const before=JSON.stringify(list);const r=cashflowProjection(list,[],settings(),'TWD','2026-10-02');
 assert.equal(r.forecastMonthly,150);assert.equal(r.gap,150);assert.equal(r.monthlyIncomeAdded,40);assert.equal(r.months,4);assert.equal(r.totalInvestment,36000);assert.equal(JSON.stringify(list),before);assert.equal(r.actualMonthly,null);
});
test('zero target, zero contributions, missing yield and removed holdings never produce fake completion',()=>{
 assert.equal(cashflowProjection([h],[],defaultCashflowTools(),'TWD','2026-10-02').months,null);
 assert.equal(cashflowProjection([h,h2],[],{...settings(),plans:[]},'TWD','2026-10-02').months,null);
 assert.equal(cashflowProjection([{...h,divRate:0},h2],[],settings(),'TWD','2026-10-02').months,null);
 const orphan=cashflowProjection([h],[],settings(),'TWD','2026-10-02');assert.equal(orphan.incomplete,true);assert.match(orphan.plans[1].error,/不存在/);
 assert.equal(cashflowProjection([h,h2],[],{...settings(),monthlyTargets:{TWD:100,USD:0}},'TWD','2026-10-02').months,0);
});
test('official yield does not overwrite cash-yield assumptions and currencies stay separate',()=>{
 const list=[{...h,officialYield:{rate:99}},{...h2,category:'美股'}];const r=cashflowProjection(list,[],{...settings(),plans:[]},'TWD','2026-10-02');assert.equal(r.forecastMonthly,100);
 const leap=cashflowProjection([],[],defaultCashflowTools(),'TWD','2024-03-01');assert.equal(leap.end,'2024-02-29');
});
test('price targets select cost, custom or the latest same-market buy with stable same-day ordering',()=>{
 const trades=[{...div('buy1','2026-10-01',0),type:'BUY',price:21},{...div('buy2','2026-10-01',0),type:'BUY',price:19},{...div('future','2026-10-03',0),type:'BUY',price:99},{...div('wrong','2026-10-01',0),type:'BUY',price:100,category:'美股'}];
 assert.equal(priceAlertStatus(a,[h],trades,now).target,20);assert.equal(priceAlertStatus({...a,basis:'LAST_BUY'},[h],trades,now).target,21);assert.equal(priceAlertStatus({...a,basis:'CUSTOM',customPrice:18},[h],trades,now).target,18);
});
test('alert fires once on entry, not each quote or reload, and rearms only after leaving',()=>{
 let r=advancePriceAlerts([a],[h],[],now);assert.equal(r.triggered.length,1);assert.equal(r.alerts[0].lastTriggeredAt,new Date(now).toISOString());assert.equal(a.inside,false);
 assert.equal(advancePriceAlerts(r.alerts,[h],[],now).changed,false);
 r=advancePriceAlerts(r.alerts,[{...h,currentPrice:20.1,quoteCheckedAt:new Date(now+1000).toISOString()}],[],now+1000);assert.equal(r.triggered.length,0);
 r=advancePriceAlerts(r.alerts,[{...h,currentPrice:21,quoteCheckedAt:new Date(now+2000).toISOString()}],[],now+2000);assert.equal(r.alerts[0].inside,false);
 r=advancePriceAlerts(r.alerts,[{...h,quoteCheckedAt:new Date(now+3000).toISOString()}],[],now+3000);assert.equal(r.triggered.length,1);
});
test('stale, manual, unknown, duplicate or missing holdings and paused alerts never trigger',()=>{
 for(const list of [[],[h,h],[{...h,quoteMode:'MANUAL'}],[{...h,priceUpdatedAt:null}],[{...h,priceUpdatedAt:'2026-09-01T00:00:00Z'}]])assert.equal(advancePriceAlerts([a],list,[],now).changed,false);
 assert.equal(advancePriceAlerts([{...a,enabled:false}],[h],[],now).triggered.length,0);
 const entered=advancePriceAlerts([a],[h],[],now).alerts;assert.equal(advancePriceAlerts(entered,[{...h,currentPrice:50,quoteMode:'MANUAL'}],[],now).alerts[0].inside,true);
});
test('range edges are inclusive and zero/invalid target is never compared',()=>{
 assert.equal(priceAlertStatus(a,[{...h,currentPrice:20.2}],[],now).status,'inside');assert.equal(priceAlertStatus(a,[{...h,currentPrice:19.8}],[],now).status,'inside');
 assert.equal(priceAlertStatus({...a,basis:'LAST_BUY'},[h],[],now).status,'no-target');assert.equal(priceAlertStatus({...a,basis:'CUSTOM',customPrice:0},[h],[],now).status,'no-target');
});
test('old backups default safely and new configuration round trips without changing trades',()=>{
 const original=parsePortfolioBackup({holdings:[h],transactions:[]}).data;assert.deepEqual(original.cashflow,defaultCashflowTools());
 const data={...original,cashflow:{...settings(),alerts:advancePriceAlerts([a],[h],[],now).alerts}};
 const restored=parsePortfolioBackup(createPortfolioBackup(data,'1.12.0')).data;assert.deepEqual(restored,data);
 for(const bad of [{...settings(),plans:[settings().plans[0],settings().plans[0]]},{...settings(),monthlyTargets:{TWD:NaN,USD:0}},{...settings(),alerts:[{...a,tolerancePct:0}]}])assert.throws(()=>parseCashflowTools(bad));
});
test('backup reminders track user settings, not automatic alert observations',()=>{
 const base={...settings(),alerts:[a]};const changed={...base,alerts:advancePriceAlerts([a],[h],[],now).alerts};assert.equal(recordSignature([h],[],base),recordSignature([h],[],changed));assert.notEqual(recordSignature([h],[],base),recordSignature([h],[],{...base,monthlyTargets:{TWD:400,USD:0}}));assert.equal(recordSignature([h],[]),recordSignature([h],[],defaultCashflowTools()));
});
test('goal view renders controls, native currency and explicit forecast limitations without a browser',()=>{
 const html=renderToStaticMarkup(createElement(Goals,{holdings:[h,h2],transactions:[],settings:settings(),today:'2026-10-02',disabled:false,onSave:()=>true}));
 for(const text of ['現金流目標','多標的定額達標試算','0 年 4 個月','NT$ 36,000','手動股息試算率','不會新增交易'])assert.ok(html.includes(text));assert.match(html,/aria-label="實收股息目標達成率"/);
});
test('price view exposes editable alerts and makes background/offline limits clear',()=>{
 const html=renderToStaticMarkup(createElement(Alerts,{holdings:[h],transactions:[],settings:{...settings(),alerts:[a]},disabled:true,now,online:false,onSave:()=>true,onOpen(){}}));
 for(const text of ['股價提醒','離線暫停','關閉 App 不會背景推播','新增價格提醒','disabled=""'])assert.ok(html.includes(text));
});
