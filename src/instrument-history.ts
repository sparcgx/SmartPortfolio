import type { Category, Holding, Transaction } from './types';

export type Instrument = Pick<Holding, 'category' | 'symbol'>;
const normalizeSymbol = (symbol: string) => symbol.trim().toUpperCase();

export function sameInstrument(a: Instrument, b: Instrument) {
  return a.category === b.category && normalizeSymbol(a.symbol) === normalizeSymbol(b.symbol);
}

export function instrumentTransactions(transactions: Transaction[], instrument: Instrument) {
  return transactions.filter(row => sameInstrument(row, instrument))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function instrumentHash(instrument: Instrument) {
  return '#instrument?' + new URLSearchParams({ market: instrument.category, symbol: normalizeSymbol(instrument.symbol) });
}

export function instrumentFromHash(hash: string): Instrument | null {
  if (!hash.startsWith('#instrument?')) return null;
  const params = new URLSearchParams(hash.slice('#instrument?'.length));
  const category = params.get('market'), symbol = normalizeSymbol(params.get('symbol') ?? '');
  if (!['台股', '美股', '公募基金'].includes(category ?? '') || !symbol) return null;
  return { category: category as Category, symbol };
}

// Native-currency cash movement only; this is not profit or a current-FX conversion.
export function transactionCash(row: Transaction): number | null {
  if (row.type !== 'DIVIDEND' && (![row.shares, row.price].every(value => value != null && Number.isFinite(value) && value > 0))) return null;
  const gross = row.type === 'DIVIDEND' ? row.amount : (row.shares ?? NaN) * (row.price ?? NaN);
  const fee = row.fee ?? 0, tax = row.tax ?? 0;
  if (gross == null || ![gross, fee, tax].every(Number.isFinite) || gross < 0 || fee < 0 || tax < 0) return null;
  const cash = row.type === 'BUY' ? -(gross + fee + tax) : gross - fee - tax;
  return Number.isFinite(cash) ? cash : null;
}
