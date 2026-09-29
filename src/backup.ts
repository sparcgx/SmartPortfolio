import { LEGACY_DEMO_HOLDINGS, LEGACY_DEMO_TRANSACTIONS } from "./data";
import type {
  Category,
  DisplayCurrency,
  Holding,
  MarketStyle,
  PortfolioBackup,
  QuoteMode,
  StoredPortfolio,
  ThemeId,
  Transaction,
  TransactionType,
} from "./types";

const CATEGORIES: Category[] = ["台股", "美股", "公募基金"];
const TRANSACTION_TYPES: TransactionType[] = ["BUY", "SELL", "DIVIDEND"];
const THEMES: ThemeId[] = ["dark", "light", "navy", "emerald"];
const CURRENCIES: DisplayCurrency[] = ["TWD", "USD"];
const MARKET_STYLES: MarketStyle[] = ["TW", "US"];
const QUOTE_MODES: QuoteMode[] = ["AUTO", "MANUAL"];

type UnknownRecord = Record<string, unknown>;

export interface ParsedPortfolioBackup {
  data: StoredPortfolio;
  exportedAt: string | null;
  appVersion: string | null;
}

export interface DemoMigrationResult {
  data: StoredPortfolio;
  removedHoldings: number;
  removedTransactions: number;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label}格式不正確`);
  }
  return value;
}

function optionalText(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function finiteNumber(value: unknown, label: string, minimum?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label}格式不正確`);
  }
  if (minimum !== undefined && value < minimum) {
    throw new Error(`${label}不可小於 ${minimum}`);
  }
  return value;
}

function optionalFiniteNumber(value: unknown, label: string) {
  if (value === undefined || value === null) return undefined;
  return finiteNumber(value, label, 0);
}

function oneOf<T extends string>(
  value: unknown,
  options: readonly T[],
  fallback: T,
) {
  return typeof value === "string" && options.includes(value as T)
    ? (value as T)
    : fallback;
}

function requiredOneOf<T extends string>(
  value: unknown,
  options: readonly T[],
  label: string,
) {
  if (typeof value !== "string" || !options.includes(value as T)) {
    throw new Error(`${label}格式不正確`);
  }
  return value as T;
}

function parseHolding(value: unknown, index: number): Holding {
  if (!isRecord(value)) throw new Error(`第 ${index + 1} 筆持股格式不正確`);
  const category = requiredOneOf(
    value.category,
    CATEGORIES,
    `第 ${index + 1} 筆持股類別`,
  );
  return {
    id: requiredText(value.id, `第 ${index + 1} 筆持股識別碼`),
    symbol: requiredText(value.symbol, `第 ${index + 1} 筆持股代號`),
    name: requiredText(value.name, `第 ${index + 1} 筆持股名稱`),
    category,
    shares: finiteNumber(value.shares, `第 ${index + 1} 筆持股數量`, 0),
    avgPrice: finiteNumber(value.avgPrice, `第 ${index + 1} 筆平均成本`, 0),
    currentPrice: finiteNumber(value.currentPrice, `第 ${index + 1} 筆目前價格`, 0),
    sector: optionalText(value.sector, "未分類") || "未分類",
    divRate: finiteNumber(value.divRate ?? 0, `第 ${index + 1} 筆殖利率`, 0),
    estDivMonth: optionalText(value.estDivMonth),
    todayChange: finiteNumber(value.todayChange ?? 0, `第 ${index + 1} 筆今日變動`),
    quoteMode: oneOf(
      value.quoteMode,
      QUOTE_MODES,
      category === "公募基金" ? "MANUAL" : "AUTO",
    ),
    quoteSource:
      optionalText(value.quoteSource) ||
      (category === "公募基金" ? "手動基金淨值" : "手動價格"),
    priceUpdatedAt:
      typeof value.priceUpdatedAt === "string" ? value.priceUpdatedAt : null,
    quoteCheckedAt:
      typeof value.quoteCheckedAt === "string" ? value.quoteCheckedAt : null,
    quoteMarketTime:
      typeof value.quoteMarketTime === "string" ? value.quoteMarketTime : null,
    quoteMarketTimestampKnown: value.quoteMarketTimestampKnown === true,
    quoteIsRealtime: value.quoteIsRealtime === true,
  };
}

function parseTransaction(value: unknown, index: number): Transaction {
  if (!isRecord(value)) throw new Error(`第 ${index + 1} 筆交易格式不正確`);
  return {
    id: requiredText(value.id, `第 ${index + 1} 筆交易識別碼`),
    symbol: requiredText(value.symbol, `第 ${index + 1} 筆交易代號`),
    name: requiredText(value.name, `第 ${index + 1} 筆交易名稱`),
    category: requiredOneOf(
      value.category,
      CATEGORIES,
      `第 ${index + 1} 筆交易類別`,
    ),
    type: requiredOneOf(
      value.type,
      TRANSACTION_TYPES,
      `第 ${index + 1} 筆交易類型`,
    ),
    date: requiredText(value.date, `第 ${index + 1} 筆交易日期`),
    shares: optionalFiniteNumber(value.shares, `第 ${index + 1} 筆交易數量`),
    price: optionalFiniteNumber(value.price, `第 ${index + 1} 筆交易價格`),
    amount: optionalFiniteNumber(value.amount, `第 ${index + 1} 筆股息金額`),
    fee: optionalFiniteNumber(value.fee, `第 ${index + 1} 筆手續費`),
    tax: optionalFiniteNumber(value.tax, `第 ${index + 1} 筆稅額`),
    costsVerified: value.costsVerified === true,
    fxRate: optionalFiniteNumber(value.fxRate, `第 ${index + 1} 筆交易匯率`),
    note: optionalText(value.note),
  };
}

function clampedNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

export function parsePortfolioBackup(value: unknown): ParsedPortfolioBackup {
  if (!isRecord(value)) throw new Error("備份檔內容格式不正確");

  const isEnvelope = value.format === "smartportfolio-backup";
  const source = isEnvelope ? value.data : value;
  if (!isRecord(source)) throw new Error("備份檔缺少投資資料");
  if (!Array.isArray(source.holdings) || !Array.isArray(source.transactions)) {
    throw new Error("備份檔缺少持股或交易清單");
  }

  const preferences = isRecord(source.preferences) ? source.preferences : {};
  const calculator = isRecord(source.calculator) ? source.calculator : {};
  const marketData = isRecord(source.marketData) ? source.marketData : {};

  return {
    data: {
      schemaVersion: 3,
      holdings: source.holdings.map(parseHolding),
      transactions: source.transactions.map(parseTransaction),
      marketData: {
        usdTwdRate: clampedNumber(
          marketData.usdTwdRate,
          32.2,
          0.0001,
          10_000,
        ),
        usdTwdUpdatedAt:
          typeof marketData.usdTwdUpdatedAt === "string"
            ? marketData.usdTwdUpdatedAt
            : null,
        lastSyncAt:
          typeof marketData.lastSyncAt === "string"
            ? marketData.lastSyncAt
            : null,
        autoRefresh:
          typeof marketData.autoRefresh === "boolean"
            ? marketData.autoRefresh
            : true,
        quoteConsent:
          typeof marketData.quoteConsent === "boolean"
            ? marketData.quoteConsent
            : false,
      },
      preferences: {
        currentTheme: oneOf(preferences.currentTheme, THEMES, "dark"),
        displayCurrency: oneOf(preferences.displayCurrency, CURRENCIES, "TWD"),
        marketStyle: oneOf(preferences.marketStyle, MARKET_STYLES, "TW"),
      },
      calculator: {
        initial: clampedNumber(calculator.initial, 50_000, 0, 1_000_000_000),
        monthly: clampedNumber(calculator.monthly, 10_000, 0, 100_000_000),
        annualRate: clampedNumber(calculator.annualRate, 7, 0, 20),
        years: Math.round(clampedNumber(calculator.years, 10, 1, 30)),
      },
    },
    exportedAt:
      isEnvelope && typeof value.exportedAt === "string" ? value.exportedAt : null,
    appVersion:
      isEnvelope && typeof value.appVersion === "string" ? value.appVersion : null,
  };
}

export function createPortfolioBackup(
  data: StoredPortfolio,
  appVersion: string,
): PortfolioBackup {
  return {
    format: "smartportfolio-backup",
    backupVersion: 1,
    appVersion,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export function readSourceSchemaVersion(value: unknown) {
  if (!isRecord(value)) return null;
  const source = value.format === "smartportfolio-backup" ? value.data : value;
  if (!isRecord(source) || typeof source.schemaVersion !== "number") return null;
  return source.schemaVersion;
}

export function removeLegacyDemoRows(data: StoredPortfolio): DemoMigrationResult {
  const holdings = data.holdings.filter((holding) => {
    const legacySymbol = LEGACY_DEMO_HOLDINGS.get(holding.id);
    return !legacySymbol || holding.symbol.toUpperCase() !== legacySymbol;
  });
  const transactions = data.transactions.filter(
    (transaction) => !LEGACY_DEMO_TRANSACTIONS.has(transaction.id),
  );

  return {
    data: { ...data, holdings, transactions },
    removedHoldings: data.holdings.length - holdings.length,
    removedTransactions: data.transactions.length - transactions.length,
  };
}
