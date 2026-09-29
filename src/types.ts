export type ThemeId = "dark" | "light" | "navy" | "emerald";
export type DisplayCurrency = "TWD" | "USD";
export type MarketStyle = "TW" | "US";
export type Category = "台股" | "美股" | "公募基金";
export type TransactionType = "BUY" | "SELL" | "DIVIDEND";
export type QuoteMode = "AUTO" | "MANUAL";
export type TabId =
  | "dashboard"
  | "holdings"
  | "transactions"
  | "dividends"
  | "dca";

export interface Holding {
  id: string;
  symbol: string;
  name: string;
  category: Category;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  sector: string;
  divRate: number;
  estDivMonth: string;
  todayChange: number;
  quoteMode: QuoteMode;
  quoteSource: string;
  priceUpdatedAt: string | null;
  quoteCheckedAt?: string | null;
  quoteMarketTime?: string | null;
  quoteMarketTimestampKnown?: boolean;
  quoteIsRealtime?: boolean;
}

export interface Transaction {
  id: string;
  symbol: string;
  name: string;
  category: Category;
  type: TransactionType;
  date: string;
  shares?: number;
  price?: number;
  amount?: number;
  fee?: number;
  tax?: number;
  costsVerified?: boolean;
  fxRate?: number;
  note?: string;
}

export interface StoredPortfolio {
  schemaVersion: 3;
  holdings: Holding[];
  transactions: Transaction[];
  marketData: {
    usdTwdRate: number;
    usdTwdUpdatedAt: string | null;
    lastSyncAt: string | null;
    autoRefresh: boolean;
    quoteConsent: boolean;
  };
  preferences: {
    currentTheme: ThemeId;
    displayCurrency: DisplayCurrency;
    marketStyle: MarketStyle;
  };
  calculator: {
    initial: number;
    monthly: number;
    annualRate: number;
    years: number;
  };
}

export interface PortfolioBackup {
  format: "smartportfolio-backup";
  backupVersion: 1;
  appVersion: string;
  exportedAt: string;
  data: StoredPortfolio;
}
