// Official published values only. Missing data is never converted to zero or annualized here.
export function parseYieldPercent(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 && value <= 1000 ? value : null;
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?\s*%?$/.test(value.trim())) return null;
  const n = Number(value.trim().replace('%', '').trim());
  return Number.isFinite(n) && n >= 0 && n <= 1000 ? n : null;
}

export function yieldDataDate(value) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[/\-]/g, '');
  if (!/^\d{7,8}$/.test(text)) return null;
  const year = text.length === 7 ? Number(text.slice(0, 3)) + 1911 : Number(text.slice(0, 4));
  const iso = `${year}-${text.slice(-4,-2)}-${text.slice(-2)}`;
  return Number.isFinite(Date.parse(iso)) && new Date(iso).toISOString().slice(0,10) === iso ? iso : null;
}

export function parseTaiwanYield(rows, symbol, provider, checkedAt) {
  if (!Array.isArray(rows)) throw new Error('Invalid official yield dataset');
  const otc = provider === 'TPEx';
  const row = rows.find(r => String(otc ? r.SecuritiesCompanyCode : r.Code).trim() === symbol);
  if (!row) return null;
  const rate = parseYieldPercent(otc ? row.YieldRatio : row.DividendYield);
  const asOf = yieldDataDate(row.Date);
  if (!asOf) throw new Error('Invalid official data date');
  return { rate, status: rate === null ? 'unavailable' : 'available', checkedAt, asOf,
    source: otc ? '櫃買中心 OpenAPI' : '臺灣證券交易所 OpenAPI',
    sourceUrl: otc ? 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis' : 'https://www.twse.com.tw/zh/trading/historical/bwibbu-day.html',
    basis: otc ? '官方每股股利／收盤價口徑' : '官方股利／收盤價口徑（可含股票股利）',
    ...(rate === null ? { message: '官方未提供殖利率數值，非 0%' } : {}),
  };
}

export function parseNasdaqYield(payload, symbol, checkedAt) {
  const data = payload?.data;
  if (!data || String(data.symbol).toUpperCase() !== symbol || !data.summaryData) throw new Error('Invalid Nasdaq summary');
  const rate = parseYieldPercent(data.summaryData.Yield?.value);
  const etf = String(data.assetClass).toUpperCase() === 'ETF';
  return { rate, status: rate === null ? 'unavailable' : 'available', checkedAt, asOf: null,
    source: 'Nasdaq 官方網站', sourceUrl: `https://www.nasdaq.com/market-activity/${etf ? 'etf' : 'stocks'}/${encodeURIComponent(symbol.toLowerCase())}`,
    basis: 'Nasdaq Current Yield（最近配息依頻率年化／股價）',
    ...(rate === null ? { message: 'Nasdaq 未提供此標的殖利率，非 0%' } : {}),
  };
}

export async function fetchOfficialYields(instruments, checkedAt, fetcher) {
  const unique = [...new Map(instruments.map(i => [`${i.category}:${i.symbol.trim().toUpperCase()}`, {category:i.category,symbol:i.symbol.trim().toUpperCase()}])).values()];
  const tw = unique.some(i => i.category === '台股' && !i.symbol.startsWith('00'));
  const datasetsPromise = Promise.allSettled(tw ? [
    fetcher('https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_d', {'user-agent':'Mozilla/5.0 (compatible; SmartPortfolio/1.11)'}),
    fetcher('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis', {'user-agent':'Mozilla/5.0 (compatible; SmartPortfolio/1.11)', referer:'https://www.tpex.org.tw/'}),
  ] : []);
  const result = [];
  for (let start = 0; start < unique.length; start += 12) {
    result.push(...await Promise.all(unique.slice(start, start + 12).map(async i => {
      const fallback = { rate:null, status:'unavailable', checkedAt, asOf:null, source:'尚無官方殖利率', sourceUrl:'', basis:'未提供', message:'未提供可直接介接的官方殖利率；保留手動試算設定' };
      try {
        if (i.category === '台股' && i.symbol.startsWith('00')) return { ...i, ...fallback,
          source:'ETF 官方配息公告', sourceUrl:`https://www.twse.com.tw/zh/ETFortune/etfInfo/${encodeURIComponent(i.symbol)}`,
          message:'此介接未提供台股 ETF 官方年化殖利率；每單位配息不直接當作年化殖利率。請查看公告，手動試算率保留。' };
        if (i.category === '公募基金') return { ...i, ...fallback, message:'基金配息口徑依發行公司；目前保留手動試算率' };
        if (i.category === '台股') {
          const datasets = await datasetsPromise;
          for (let index = 0; index < datasets.length; index++) {
            if (datasets[index].status !== 'fulfilled') continue;
            const parsed = parseTaiwanYield(datasets[index].value, i.symbol, index ? 'TPEx' : 'TWSE', checkedAt);
            if (parsed) return { ...i, ...parsed };
          }
          if (datasets.some(r => r.status === 'rejected')) throw new Error('official source unavailable');
          return { ...i, ...fallback, message:'官方資料集查無此代號，請確認市場與代號' };
        }
        for (const assetClass of ['stocks', 'etf']) {
          try {
            const payload = await fetcher(`https://api.nasdaq.com/api/quote/${encodeURIComponent(i.symbol)}/summary?assetclass=${assetClass}`,
              { referer:'https://www.nasdaq.com/', 'user-agent':'Mozilla/5.0 (compatible; SmartPortfolio/1.11)' });
            return { ...i, ...parseNasdaqYield(payload, i.symbol, checkedAt) };
          } catch { /* Try the other official asset class. */ }
        }
        throw new Error('official source unavailable');
      } catch {
        return { ...i, ...fallback, status:'error', message:'官方來源連線或格式異常，保留上次成功值' };
      }
    })));
  }
  return { fetchedAt:checkedAt, yields:result, errors:result.filter(r => r.status === 'error').map(r => `${r.category} ${r.symbol}：${r.message}`) };
}
