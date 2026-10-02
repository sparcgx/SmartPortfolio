import type { CashflowTools, Holding, PriceAlert, Transaction, DisplayCurrency, Category } from './types';
import { dividendCurrency, dividendValue } from './dividend-income';
import { holdingFreshness } from './freshness';

export const instrumentKey = (i: {category:Category;symbol:string}) => `${i.category}:${i.symbol.trim().toUpperCase()}`;
export const defaultCashflowTools = (): CashflowTools => ({monthlyTargets:{TWD:0,USD:0},plans:[],alerts:[]});
const record = (v: unknown): v is Record<string,unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const validDate = (v:string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
const positive = (v:unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

export function parseCashflowTools(value: unknown): CashflowTools {
  if (value === undefined) return defaultCashflowTools();
  const fail = (): never => { throw new Error('現金流目標或價格提醒設定格式不正確'); };
  if (!record(value) || !record(value.monthlyTargets) || !Array.isArray(value.plans) || !Array.isArray(value.alerts) || value.plans.length > 100 || value.alerts.length > 100) return fail();
  const money = (v: unknown) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1e12) return fail(); return v; };
  const identity = (r: Record<string,unknown>) => {
    if (!['台股','美股','公募基金'].includes(String(r.category)) || typeof r.symbol !== 'string' || !r.symbol.trim() || r.symbol.length > 100) return fail();
    return {category:r.category as Category,symbol:r.symbol.trim().toUpperCase()};
  };
  const plans = value.plans.map(r => {if (!record(r)) return fail();return {...identity(r),monthlyAmount:money(r.monthlyAmount)};});
  if (new Set(plans.map(instrumentKey)).size !== plans.length) return fail();
  const alerts = value.alerts.map(r => {
    if (!record(r) || typeof r.id !== 'string' || !r.id || r.id.length > 150 || !['COST','LAST_BUY','CUSTOM'].includes(String(r.basis)) || typeof r.enabled !== 'boolean' || typeof r.inside !== 'boolean' || !positive(r.tolerancePct) || r.tolerancePct > 50) return fail();
    const customPrice = money(r.customPrice);
    if (r.basis === 'CUSTOM' && customPrice === 0) return fail();
    if (r.lastObservation !== null && (typeof r.lastObservation !== 'string' || r.lastObservation.length > 500)) return fail();
    if (r.lastTriggeredAt !== null && (typeof r.lastTriggeredAt !== 'string' || !Number.isFinite(Date.parse(r.lastTriggeredAt)))) return fail();
    return {...identity(r),id:r.id,basis:r.basis as PriceAlert['basis'],customPrice,tolerancePct:r.tolerancePct,enabled:r.enabled,inside:r.inside,lastObservation:r.lastObservation as string|null,lastTriggeredAt:r.lastTriggeredAt as string|null};
  });
  if (new Set(alerts.map(r=>r.id)).size !== alerts.length) return fail();
  return {monthlyTargets:{TWD:money(value.monthlyTargets.TWD),USD:money(value.monthlyTargets.USD)},plans,alerts};
}

// Closed calendar months only; original currencies never mix via today's FX rate.
export function cashflowProjection(holdings: Holding[], transactions: Transaction[], settings: CashflowTools, currency: DisplayCurrency, today: string) {
  if (!validDate(today)) throw new Error('無效日期');
  const y = Number(today.slice(0,4)), m = Number(today.slice(5,7))-1;
  const start = new Date(Date.UTC(y,m-12,1)).toISOString().slice(0,10);
  const end = new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
  const candidates = transactions.filter(r => r.type === 'DIVIDEND' && dividendCurrency(r.category) === currency && r.date >= start && r.date <= end);
  const rows = candidates.filter(r => validDate(r.date) && dividendValue(r).valid);
  const actualNet = rows.reduce((n,r)=>n+dividendValue(r).net,0);
  const assets = holdings.filter(h=>dividendCurrency(h.category)===currency && h.shares > 0);
  const valid = assets.filter(h=>positive(h.currentPrice) && positive(h.divRate) && Number.isFinite(h.shares*h.currentPrice*h.divRate/100));
  const forecastMonthly = valid.reduce((n,h)=>n+h.shares*h.currentPrice*h.divRate/100/12,0);
  const target = settings.monthlyTargets[currency];
  const gap = Math.max(0,target-forecastMonthly);
  const plans = settings.plans.filter(p=>dividendCurrency(p.category)===currency).map(p=>{
    const matches = holdings.filter(h=>instrumentKey(h)===instrumentKey(p));
    const h = matches.length === 1 ? matches[0] : null;
    const error = !h ? '持股不存在或代號重複' : !positive(h.currentPrice) ? '尚無有效現價' : !positive(h.divRate) ? '請設定手動股息試算率' : !Number.isFinite(p.monthlyAmount*h.divRate/100/12) ? '試算金額超出範圍' : null;
    return {...p,holding:h,error,monthlyIncomeAdded:error ? 0 : p.monthlyAmount*h!.divRate/100/12};
  });
  const monthlyInvestment = plans.reduce((n,p)=>n+p.monthlyAmount,0);
  const monthlyIncomeAdded = plans.reduce((n,p)=>n+p.monthlyIncomeAdded,0);
  const incomplete = assets.length !== valid.length || plans.some(p=>p.monthlyAmount>0 && p.error) || ![forecastMonthly,monthlyInvestment,monthlyIncomeAdded].every(Number.isFinite);
  const months = target<=0 || incomplete ? null : gap === 0 ? 0 : monthlyIncomeAdded>0 ? Math.ceil(gap/monthlyIncomeAdded-1e-10) : null;
  const boundedMonths = months !== null && Number.isFinite(months) && months <= 1200 ? months : null;
  return {start,end,actualNet,actualMonthly:rows.length && Number.isFinite(actualNet) ? actualNet/12 : null,unverified:rows.filter(r=>!r.costsVerified).length,
    count:rows.length,invalidCount:candidates.length-rows.length,forecastMonthly,target,gap,plans,monthlyInvestment,monthlyIncomeAdded,
    incomplete,missingForecast:assets.length-valid.length,months:boundedMonths,tooLong:months!==null&&months>1200,
    totalInvestment:boundedMonths===null ? null : boundedMonths*monthlyInvestment};
}

export function priceAlertStatus(alert: PriceAlert, holdings: Holding[], transactions: Transaction[], now:number) {
  const matches = holdings.filter(h=>instrumentKey(h)===instrumentKey(alert));
  const holding = matches.length===1 ? matches[0] : null;
  const day = new Date(now+8*3600_000).toISOString().slice(0,10);
  const lastBuy = transactions.map((r,index)=>({r,index})).filter(({r})=>r.type==='BUY'&&instrumentKey(r)===instrumentKey(alert)&&validDate(r.date)&&r.date<=day&&positive(r.price))
    .sort((a,b)=>b.r.date.localeCompare(a.r.date)||a.index-b.index)[0]?.r;
  const target = alert.basis==='CUSTOM' ? alert.customPrice : alert.basis==='COST' ? holding?.avgPrice : lastBuy?.price;
  const distance = holding && positive(holding.currentPrice) && positive(target) ? (holding.currentPrice-target)/target*100 : null;
  const status = !alert.enabled ? 'disabled' : !holding ? 'missing' : !positive(target) ? 'no-target' :
    !positive(holding.currentPrice) || holdingFreshness(holding,now)!=='recent' ? 'stale' :
    distance!==null && Math.abs(distance)<=alert.tolerancePct+1e-8 ? 'inside' : 'outside';
  return {holding,target:target??null,distance,status};
}

// Observe new prices once. Stale/offline data neither triggers nor rearms an alert.
export function advancePriceAlerts(alerts: PriceAlert[], holdings: Holding[], transactions: Transaction[], now:number) {
  const triggered: PriceAlert[] = [];
  let changed = false;
  const next = alerts.map(a=>{
    const s = priceAlertStatus(a,holdings,transactions,now);
    if (s.status!=='inside' && s.status!=='outside') return a;
    const observation = `${s.holding!.quoteCheckedAt}|${s.holding!.priceUpdatedAt}|${s.holding!.currentPrice}|${s.target}|${a.tolerancePct}`;
    if (observation===a.lastObservation) return a;
    const inside = s.status==='inside';
    const fire = inside && !a.inside;
    const row = {...a,inside,lastObservation:observation,lastTriggeredAt:fire ? new Date(now).toISOString() : a.lastTriggeredAt};
    changed = true;if(fire)triggered.push(row);return row;
  });
  return {alerts:changed?next:alerts,triggered,changed};
}
