import type { Holding, Transaction } from "./types";

const EPSILON = 1e-7;

export interface Position {
  shares: number;
  avgPrice: number;
}

export function replayPosition(transactions: Transaction[]): Position | null {
  // The stored list is newest entry first. For trades on the same day, keep
  // their original entry order (oldest entry first).
  const ordered = transactions
    .map((transaction, index) => ({ transaction, index }))
    .filter(({ transaction }) => transaction.type !== "DIVIDEND")
    .sort((a, b) => a.transaction.date.localeCompare(b.transaction.date) || b.index - a.index);
  let shares = 0;
  let cost = 0;
  for (const { transaction } of ordered) {
    const units = transaction.shares ?? NaN;
    const price = transaction.price ?? NaN;
    if (!Number.isFinite(units) || units <= 0 || !Number.isFinite(price) || price <= 0) return null;
    if (transaction.type === "BUY") {
      cost += units * price;
      shares += units;
    } else {
      if (units > shares + EPSILON) return null;
      const average = shares ? cost / shares : 0;
      shares = Math.max(0, shares - units);
      cost = shares < EPSILON ? 0 : average * shares;
    }
  }
  return { shares, avgPrice: shares < EPSILON ? 0 : cost / shares };
}

export function samePosition(position: Position | null, holding: Holding | null): boolean {
  if (!position || !Number.isFinite(position.shares) || !Number.isFinite(position.avgPrice)) return false;
  if (holding && (!Number.isFinite(holding.shares) || !Number.isFinite(holding.avgPrice))) return false;
  const shares = holding?.shares ?? 0;
  if (Math.abs(position.shares - shares) > EPSILON * Math.max(1, shares)) return false;
  return shares < EPSILON || Math.abs(position.avgPrice - (holding?.avgPrice ?? 0)) <= 0.000051;
}

export function assessTrade(
  holding: Holding | null,
  history: Transaction[],
  trade: Transaction,
  today: string,
): { position: Position; error: null; mode: "replay" | "document" | "append" } | { error: string; position: null; mode: null } {
  const previous = replayPosition(history);
  const next = replayPosition([trade, ...history]);
  if (previous && samePosition(previous, holding)) {
    if (!next) return { error: "依交易日期計算，當時持股不足以賣出；請先補齊更早的買入紀錄", position: null, mode: null };
    return { position: next, mode: "replay", error: null };
  }
  // A user may be filling in an omitted old trade already included in their
  // manually entered position. Document it without adding shares twice.
  if (next && samePosition(next, holding)) return { position: next, mode: "document", error: null };
  const latest = history.reduce((date, row) => row.type === "DIVIDEND" ? date : (row.date > date ? row.date : date), "");
  if (holding && trade.date >= (latest || today)) {
    const shares = holding.shares + (trade.type === "BUY" ? trade.shares! : -trade.shares!);
    if (shares < -EPSILON) return { error: "賣出數量超過目前持股", position: null, mode: null };
    const avgPrice = trade.type === "BUY"
      ? (holding.shares * holding.avgPrice + trade.shares! * trade.price!) / shares
      : shares < EPSILON ? 0 : holding.avgPrice;
    return { position: { shares: Math.max(0, shares), avgPrice }, mode: "append", error: null };
  }
  return { error: "既有持股與交易紀錄尚未對齊；請先補齊缺少的買入紀錄，或核對持股數量與平均成本，再補登這筆舊交易", position: null, mode: null };
}

export function assessHistoryChange(holdings: Holding[], history: Transaction[], id: string,
  replacement: Transaction | null, today: string) {
  const fail = (error: string) => ({ error, holdings, transactions: history, before: null, after: null });
  const matches = history.filter(row => row.id === id);
  if (matches.length !== 1) return fail('交易識別碼不存在或重複，請先核對備份資料');
  const original = matches[0];
  if (replacement) {
    if (replacement.id !== id || replacement.symbol !== original.symbol || replacement.category !== original.category || replacement.type !== original.type)
      return fail('編輯時不可變更標的或交易類型');
    if (replacement.fxRate !== undefined && (!Number.isFinite(replacement.fxRate) || replacement.fxRate <= 0)) return fail('交易匯率必須大於零');
    const date = replacement.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date || date > today)
      return fail('請輸入有效且不晚於今天的交易日期');
    const values = original.type === 'DIVIDEND' ? [replacement.amount] : [replacement.shares, replacement.price];
    if (values.some(value => value === undefined || !Number.isFinite(value) || value <= 0)) return fail('數量、價格或股息金額必須大於零');
    if ([replacement.fee ?? 0, replacement.tax ?? 0].some(value => !Number.isFinite(value) || value < 0)) return fail('費用與稅額不可為負數');
  }
  const transactions = replacement ? history.map(row => row.id === id ? replacement : row) : history.filter(row => row.id !== id);
  if (original.type === 'DIVIDEND') return {error: null, holdings, transactions, before: null, after: null};
  const sameAsset = (row: Transaction | Holding) => row.category === original.category && row.symbol.toUpperCase() === original.symbol.toUpperCase();
  const assets = holdings.filter(sameAsset);
  if (assets.length !== 1) return fail('找不到唯一的對應持股；請先恢復或整理該標的持股，再修改買賣紀錄');
  const holding = assets[0];
  const before = replayPosition(history.filter(sameAsset));
  if (!samePosition(before, holding)) return fail(`對帳未通過：交易履歷與目前持股數量或平均成本不一致。持股：${holding.shares}／均價 ${holding.avgPrice}；履歷重算：${before ? `${before.shares}／均價 ${Math.round(before.avgPrice * 10000) / 10000}` : '無法重算（紀錄不完整或歷史超賣）'}。請先補齊紀錄並核對持股；已阻止套用。`);
  const after = replayPosition(transactions.filter(sameAsset));
  if (!after) return fail('修改後有歷史時點持股不足以賣出，請先調整相關賣出紀錄');
  if (!Number.isFinite(after.shares) || !Number.isFinite(after.avgPrice)) return fail('計算結果超出可處理範圍');
  const rounded = {...after, avgPrice: Math.round(after.avgPrice * 10000) / 10000};
  return { error: null, transactions, before: {shares:holding.shares, avgPrice:holding.avgPrice}, after: rounded,
    holdings: holdings.map(row => row.id === holding.id ? {...row, ...rounded} : row) };
}
