import type { Holding } from "./types";

export type PriceFreshness = "recent" | "older" | "unknown" | "manual";
const DAY_MS = 86_400_000;

export function holdingFreshness(holding: Holding, now = Date.now()): PriceFreshness {
  if (holding.quoteMode === "MANUAL" || holding.category === "公募基金") return "manual";
  const checked = holding.quoteCheckedAt ? Date.parse(holding.quoteCheckedAt) : NaN;
  if (!Number.isFinite(checked) || checked > now + 5 * 60_000) return "unknown";
  if (now - checked > DAY_MS) return "older";
  if (holding.quoteMarketTimestampKnown) {
    const marketTime = holding.priceUpdatedAt ? Date.parse(holding.priceUpdatedAt) : NaN;
    if (!Number.isFinite(marketTime) || marketTime > now + 5 * 60_000) return "unknown";
    return now - marketTime > DAY_MS ? "older" : "recent";
  }
  if (holding.quoteIsRealtime && now - checked <= 15 * 60_000) return "recent";
  // A successful request alone does not prove the last trade was recent.
  return "unknown";
}

export function fxFreshness(asOf: string | null, now = Date.now()) {
  if (!asOf) return "unknown" as const;
  const date = Date.parse(asOf);
  if (!Number.isFinite(date) || date > now + DAY_MS) return "unknown" as const;
  return now - date > 3 * DAY_MS ? "older" as const : "recent" as const;
}

export const FRESHNESS_LABELS: Record<PriceFreshness, string> = {
  recent: "近期行情",
  older: "資料逾 24 小時",
  unknown: "行情時間待確認",
  manual: "手動維護",
};
