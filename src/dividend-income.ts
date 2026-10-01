import type { Holding, Transaction } from './types';
export type IncomeCurrency = 'TWD' | 'USD';
export const dividendCurrency = (category: string): IncomeCurrency => category === '美股' ? 'USD' : 'TWD';
export function dividendValue(row: Transaction) {
  const gross = row.amount ?? NaN, fee = row.fee ?? 0, tax = row.tax ?? 0;
  const valid = [gross, fee, tax].every(Number.isFinite) && gross > 0 && fee >= 0 && tax >= 0;
  return { gross, costs: fee + tax, net: gross - fee - tax, valid: valid && Number.isFinite(gross-fee-tax) };
}
function validDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date;
}
function dateAt(year: number, month: number, day: number) {
  const max = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2,'0')}-${String(Math.min(day,max)).padStart(2,'0')}`;
}
export function dividendIncome(holdings: Holding[], transactions: Transaction[], year: number, month: number, currency: IncomeCurrency, today: string) {
  const currentYear = Number(today.slice(0,4)), currentMonth = Number(today.slice(5,7)), currentDay = Number(today.slice(8,10));
  const all = transactions.filter(r => r.type === 'DIVIDEND' && dividendCurrency(r.category) === currency);
  const invalid = all.filter(r => !validDate(r.date) || !dividendValue(r).valid);
  const valid = all.filter(r => validDate(r.date) && dividendValue(r).valid && r.date <= today);
  const sum = (rows: Transaction[]) => rows.reduce((a,r) => {const v=dividendValue(r);return {gross:a.gross+v.gross,costs:a.costs+v.costs,net:a.net+v.net,count:a.count+1,unverified:a.unverified+(r.costsVerified===true?0:1)};},{gross:0,costs:0,net:0,count:0,unverified:0});
  const periodRows = (targetYear: number, targetMonth: number) => {
    let end = dateAt(targetYear, targetMonth || 12, 31);
    if (year === currentYear && (!targetMonth || targetMonth === currentMonth)) end = dateAt(targetYear,currentMonth,currentDay);
    if (year > currentYear || (year === currentYear && targetMonth > currentMonth)) return [];
    return valid.filter(r => Number(r.date.slice(0,4))===targetYear && (!targetMonth || Number(r.date.slice(5,7))===targetMonth) && r.date<=end);
  };
  const rows = periodRows(year,month).sort((a,b)=>b.date.localeCompare(a.date));
  const previous = sum(periodRows(year-1,month));
  const total = sum(rows);
  const forecast = Array<number>(12).fill(0);
  if (year===currentYear) for(const h of holdings.filter(h=>dividendCurrency(h.category)===currency)) {
    const months=[...new Set(h.estDivMonth.split(',').map(Number).filter(m=>Number.isInteger(m)&&m>=1&&m<=12))];
    const amount=h.shares*h.currentPrice*h.divRate/100;
    if(months.length && Number.isFinite(amount) && amount>=0) for(const m of months) forecast[m-1]+=amount/months.length;
  }
  const monthly = Array.from({length:12},(_,i)=>({month:i+1,...sum(periodRows(year,i+1)),previous:sum(periodRows(year-1,i+1)),forecast:year===currentYear?forecast[i]:null}));
  const grouped = new Map<string,{key:string;name:string;symbol:string;category:Transaction['category'];rows:Transaction[]}>();
  for(const r of rows){const key=`${r.category}:${r.symbol.trim().toUpperCase()}`;const entry=grouped.get(key)??{key,name:r.name,symbol:r.symbol,category:r.category,rows:[]};entry.rows.push(r);grouped.set(key,entry);}
  const ranking=[...grouped.values()].map(r=>({...r,...sum(r.rows)})).sort((a,b)=>b.net-a.net);
  return {rows,total,previous,monthly,ranking,invalidCount:invalid.length,forecast:year===currentYear?(month?forecast[month-1]:forecast.reduce((a,b)=>a+b,0)):null,
    comparison:total.count>0&&previous.count>0?{difference:total.net-previous.net,percent:previous.net>0?(total.net-previous.net)/previous.net*100:null}:null};
}
