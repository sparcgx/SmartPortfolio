import type { Holding, OfficialYield, Category } from './types';

export function validateOfficialYield(value: unknown): OfficialYield | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const row = value as OfficialYield;
  if (!['available','unavailable','error'].includes(row.status) ||
      (row.rate !== null && (!Number.isFinite(row.rate) || row.rate < 0 || row.rate > 1000)) ||
      (row.status === 'available' && row.rate === null) || typeof row.source !== 'string' || typeof row.basis !== 'string' ||
      typeof row.sourceUrl !== 'string' || typeof row.checkedAt !== 'string' || !Number.isFinite(Date.parse(row.checkedAt)) ||
      (row.asOf !== null && (typeof row.asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.asOf) || !Number.isFinite(Date.parse(row.asOf)) || new Date(row.asOf).toISOString().slice(0,10) !== row.asOf))) return undefined;
  if (row.sourceUrl) {
    try { const url = new URL(row.sourceUrl); if (url.protocol !== 'https:' || !['www.twse.com.tw','www.tpex.org.tw','www.nasdaq.com'].includes(url.hostname) || url.username || url.password) return undefined; } catch { return undefined; }
  }
  return {rate:row.rate,status:row.status,source:row.source.slice(0,100),sourceUrl:row.sourceUrl,basis:row.basis.slice(0,200),asOf:row.asOf,checkedAt:row.checkedAt,
    ...(typeof row.message === 'string' ? {message:row.message.slice(0,300)} : {})};
}

export function mergeOfficialYield(previous: OfficialYield | undefined, incoming: OfficialYield): OfficialYield {
  if (previous?.rate != null && (incoming.status === 'error' || (previous.asOf && incoming.asOf && incoming.asOf < previous.asOf))) {
    return {...previous,status:'error',message:incoming.status === 'error' ? incoming.message : '官方回傳日期較舊，保留上次成功值'};
  }
  return incoming;
}

export async function fetchDividendYields(holdings: Holding[], signal?: AbortSignal) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('裝置離線，已保留上次資料');
  const endpoint = typeof window !== 'undefined' && window.location.hostname === 'sparcgx.github.io'
    ? 'https://smartportfolio.sparcgx2420.chatgpt.site/api/dividend-yields' : '/api/dividend-yields';
  const instruments = [...new Map(holdings.filter(h => h.category !== "公募基金").map(h => [`${h.category}:${h.symbol.trim().toUpperCase()}`, {category:h.category,symbol:h.symbol.trim().toUpperCase()}])).values()];
  const yields: (OfficialYield & {category:Category;symbol:string})[] = [...new Map(holdings.filter(h => h.category === '公募基金').map(h => [h.symbol.trim().toUpperCase(), h])).values()].map(h => ({
    category:h.category,symbol:h.symbol.trim().toUpperCase(),rate:null,status:'unavailable',checkedAt:new Date().toISOString(),asOf:null,
    source:'尚無官方殖利率',sourceUrl:'',basis:'未提供',message:'基金配息口徑依發行公司；目前保留手動試算率，未向外傳送基金代號',
  }));
  for (let start = 0; start < instruments.length; start += 12) {
    const batch = instruments.slice(start,start + 12);
    const response = await fetch(endpoint,{method:'POST',credentials:'omit',headers:{'content-type':'application/json'},body:JSON.stringify({instruments:batch}),signal});
    if (!response.ok) throw new Error(`官方殖利率服務暫時無法使用（${response.status}）`);
    const data = await response.json();
    if (!Array.isArray(data?.yields) || data.yields.length !== batch.length) throw new Error('官方殖利率回傳格式異常');
    for (const row of data.yields) {
      const parsed = validateOfficialYield(row);
      if (!parsed || !batch.some(i => i.category === row.category && i.symbol === row.symbol) || yields.some(i => i.category === row.category && i.symbol === row.symbol)) throw new Error('官方殖利率回傳格式異常');
      yields.push({...parsed,category:row.category,symbol:row.symbol});
    }
  }
  return yields;
}
