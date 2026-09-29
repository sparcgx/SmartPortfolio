import type { Holding, Transaction } from './types';
import { replayPosition, samePosition } from './accounting';

export function investmentPerformance(holdings: Holding[], transactions: Transaction[], usdRate: number) {
  const keys = new Set([...holdings, ...transactions].map(r => `${r.category}:${r.symbol.toUpperCase()}`));
  return [...keys].map(key => {
    const match = (r: Holding | Transaction) => `${r.category}:${r.symbol.toUpperCase()}` === key;
    const rows = transactions.filter(match);
    const assets = holdings.filter(match);
    const identity = assets[0] ?? rows[0];
    const usd = identity.category === '美股';
    const ordered = rows.map((r,i)=>({r,i})).sort((a,b)=>a.r.date.localeCompare(b.r.date)||b.i-a.i);
    let shares=0, cost=0, twdCost=0, realized=0, dividends=0, fees=0, invested=0, twdRealized=0, twdDividends=0;
    let fxKnown=true, valid=true;
    const annual: Record<string,{realized:number;dividends:number}> = {};
    for (const {r} of ordered) {
      const fee=r.fee??0, tax=r.tax??0;
      const fx=usd ? r.fxRate : 1;
      if (!fx || !Number.isFinite(fx) || fx<=0) fxKnown=false;
      const rate=fx??0;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !Number.isFinite(Date.parse(r.date)) || new Date(r.date).toISOString().slice(0,10)!==r.date || !Number.isFinite(fee)||!Number.isFinite(tax)||fee<0||tax<0) valid=false;
      const year=r.date.slice(0,4); annual[year]??={realized:0,dividends:0};
      fees+=fee+tax;
      if(r.type==='DIVIDEND') {
        if(!Number.isFinite(r.amount)||r.amount!<=0) valid=false;
        const net=(r.amount??0)-fee-tax; dividends+=net; twdDividends+=net*rate; annual[year].dividends+=net;
      } else {
        const quantity=r.shares??0, price=r.price??0;
        if(!Number.isFinite(quantity)||!Number.isFinite(price)||quantity<=0||price<=0) valid=false;
        if(r.type==='BUY') {const cash=quantity*price+fee+tax; shares+=quantity;cost+=cash;twdCost+=cash*rate;invested+=cash;}
        else {
          if(quantity>shares+1e-7 || shares<=0) {valid=false;continue;}
          const soldCost=cost*quantity/shares, soldTwd=twdCost*quantity/shares;
          const cash=quantity*price-fee-tax, gain=cash-soldCost;
          realized+=gain;twdRealized+=cash*rate-soldTwd;annual[year].realized+=gain;
          shares=Math.max(0,shares-quantity);cost-=soldCost;twdCost-=soldTwd;
          if(shares<1e-7){shares=0;cost=0;twdCost=0;}
        }
      }
    }
    const replay=replayPosition(rows);
    const aligned=assets.length<=1 && samePosition(replay,assets[0]??null);
    const error=(!valid || ![cost,realized,dividends,fees,invested,twdCost,twdRealized,twdDividends].every(Number.isFinite))?'交易欄位無效、數值超限或歷史超賣':!aligned?'持股與履歷未對齊':null;
    const value=shares*(assets[0]?.currentPrice??0);
    const unrealized=value-cost;
    const total=realized+dividends+unrealized;
    const verified=rows.length>0 && rows.every(r=>r.costsVerified===true);
    return {key,name:identity.name,symbol:identity.symbol,currency:usd?'USD':'TWD',error,verified,fxKnown,
      realized,dividends,fees,cost,invested,unrealized,total,returnRate:invested>0?total/invested*100:null,annual,
      twdTotal:fxKnown && Number.isFinite(usdRate) && usdRate>0 ? twdRealized+twdDividends+value*(usd?usdRate:1)-twdCost:null};
  });
}
