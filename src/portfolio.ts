import type {
  Category,
  DisplayCurrency,
  Holding,
  Transaction,
  TransactionType,
} from "./types";

export const FALLBACK_USD_RATE = 32.2;

export function assetRate(
  category: Category,
  usdTwdRate = FALLBACK_USD_RATE,
) {
  return category === "美股" ? usdTwdRate : 1;
}

export function holdingValueTwd(
  holding: Holding,
  usdTwdRate = FALLBACK_USD_RATE,
) {
  return (
    holding.shares *
    holding.currentPrice *
    assetRate(holding.category, usdTwdRate)
  );
}

export function holdingCostTwd(
  holding: Holding,
  usdTwdRate = FALLBACK_USD_RATE,
) {
  return (
    holding.shares *
    holding.avgPrice *
    assetRate(holding.category, usdTwdRate)
  );
}

export function formatMoney(
  amountTwd: number,
  displayCurrency: DisplayCurrency,
  usdTwdRate = FALLBACK_USD_RATE,
) {
  const safeRate = usdTwdRate > 0 ? usdTwdRate : FALLBACK_USD_RATE;
  const value = displayCurrency === "USD" ? amountTwd / safeRate : amountTwd;
  const formatted = new Intl.NumberFormat("zh-TW", {
    minimumFractionDigits: displayCurrency === "USD" ? 2 : 0,
    maximumFractionDigits: displayCurrency === "USD" ? 2 : 0,
  }).format(Number.isFinite(value) ? value : 0);
  return `${displayCurrency === "USD" ? "US$" : "NT$"} ${formatted}`;
}

export function formatNativeMoney(amount: number, category: Category) {
  const formatted = new Intl.NumberFormat("zh-TW", {
    minimumFractionDigits: category === "美股" ? 2 : 0,
    maximumFractionDigits: category === "美股" ? 4 : 2,
  }).format(Number.isFinite(amount) ? amount : 0);
  return `${category === "美股" ? "US$" : "NT$"} ${formatted}`;
}

export function normalizeDividendMonths(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,，\s]+/)
        .map(Number)
        .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12),
    ),
  ).sort((a, b) => a - b);
}

export function transactionValueTwd(
  transaction: Transaction,
  usdTwdRate = FALLBACK_USD_RATE,
) {
  const nativeValue =
    transaction.type === "DIVIDEND"
      ? transaction.amount ?? 0
      : (transaction.shares ?? 0) * (transaction.price ?? 0);
  return nativeValue * assetRate(transaction.category, usdTwdRate);
}

export function estimateTransactionCosts(
  category: Category,
  type: TransactionType,
  shares: number,
  price: number,
  sector = "",
) {
  if (type === "DIVIDEND" || shares <= 0 || price <= 0) {
    return { fee: 0, tax: 0 };
  }

  const nativeTradeValue = shares * price;
  const fee =
    category === "台股"
      ? Math.max(20, Math.round(nativeTradeValue * 0.001425))
      : category === "美股"
        ? Math.max(1, Math.round(nativeTradeValue * 0.001 * 100) / 100)
        : 0;
  const tax =
    category === "台股" && type === "SELL"
      ? Math.round(
          nativeTradeValue *
            (sector.toUpperCase().includes("ETF") ? 0.001 : 0.003),
        )
      : 0;

  return { fee, tax };
}

export function localDateString(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function isValidHistoricalDate(
  value: string,
  today = localDateString(),
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;

  return isRealDate && value <= today;
}

export function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
