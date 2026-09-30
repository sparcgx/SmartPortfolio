import type { Category, Holding } from "./types";

export interface MarketQuote {
  category: Extract<Category, "台股" | "美股">;
  symbol: string;
  price: number;
  changePercent: number;
  source: string;
  asOf: string;
  providerTimestamp: string | null;
  isRealtime: boolean;
  marketTimestampKnown: boolean;
}

export interface MarketSnapshot {
  fetchedAt: string;
  fx: {
    rate: number;
    asOf: string;
    source: string;
  } | null;
  quotes: MarketQuote[];
  errors: string[];
}

export function marketQuoteKey(category: Category, symbol: string) {
  return `${category}:${symbol.trim().toUpperCase()}`;
}

export async function fetchMarketSnapshot(
  holdings: Holding[],
  signal?: AbortSignal,
): Promise<MarketSnapshot> {
  const instruments = holdings
    .filter(
      (holding) =>
        holding.quoteMode === "AUTO" && holding.category !== "公募基金",
    )
    .map((holding) => ({
      category: holding.category,
      symbol: holding.symbol.trim().toUpperCase(),
    }));

  const uniqueInstruments = Array.from(
    new Map(
      instruments.map((instrument) => [
        marketQuoteKey(instrument.category, instrument.symbol),
        instrument,
      ]),
    ).values(),
  );

  const endpoint = typeof window !== "undefined" && window.location.hostname === "sparcgx.github.io"
    ? "https://smartportfolio.sparcgx2420.chatgpt.site/api/market-data"
    : "/api/market-data";
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("裝置離線，請恢復網路後重試");
  }
  const response = await fetch(endpoint, {
    credentials: "omit",
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ instruments: uniqueInstruments }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`行情服務暫時無法使用（${response.status}）`);
  }

  const value: unknown = await response.json();
  if (!value || typeof value !== "object" ||
      !Array.isArray((value as MarketSnapshot).quotes) ||
      !Array.isArray((value as MarketSnapshot).errors) ||
      typeof (value as MarketSnapshot).fetchedAt !== "string") {
    throw new Error("行情服務回傳格式不正確");
  }
  return value as MarketSnapshot;
}
