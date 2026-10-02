import type { CashflowTools, Holding, Transaction } from "./types";

export interface BackupMarker {
  exportedAt: string;
  signature: string;
  transactionIds: string[];
}

// Market quotes change automatically. Only user-maintained records belong to
// the backup reminder's change detector.
export function recordSignature(holdings: Holding[], transactions: Transaction[], cashflow?: CashflowTools) {
  const records = JSON.stringify({
    holdings: holdings.map(({ id, symbol, name, category, shares, avgPrice, sector, divRate, estDivMonth, quoteMode }) =>
      [id, symbol, name, category, shares, avgPrice, sector, divRate, estDivMonth, quoteMode]),
    transactions,
    ...(cashflow && (cashflow.monthlyTargets.TWD || cashflow.monthlyTargets.USD || cashflow.plans.length || cashflow.alerts.length) ? {
      cashflow: {monthlyTargets:cashflow.monthlyTargets,plans:cashflow.plans,
        alerts:cashflow.alerts.map(({id,category,symbol,basis,customPrice,tolerancePct,enabled})=>({id,category,symbol,basis,customPrice,tolerancePct,enabled}))},
    } : {}),
  });
  let hash = BigInt("0xcbf29ce484222325");
  for (let index = 0; index < records.length; index++) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(records.charCodeAt(index))) * BigInt("0x100000001b3"));
  }
  return `${records.length}:${hash.toString(16).padStart(16, "0")}`;
}

export function parseBackupMarker(raw: string | null): BackupMarker | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const marker = value as Partial<BackupMarker>;
    if (typeof marker.exportedAt !== "string" || !Number.isFinite(Date.parse(marker.exportedAt)) ||
      typeof marker.signature !== "string" || !Array.isArray(marker.transactionIds) ||
      !marker.transactionIds.every((id) => typeof id === "string")) return null;
    return marker as BackupMarker;
  } catch {
    return null;
  }
}

export function backupReminder(
  marker: BackupMarker | null,
  holdings: Holding[],
  transactions: Transaction[],
  now = Date.now(),
  cashflow?: CashflowTools,
) {
  const hasRecords = holdings.length > 0 || transactions.length > 0 || Boolean(cashflow && (cashflow.monthlyTargets.TWD || cashflow.monthlyTargets.USD || cashflow.plans.length || cashflow.alerts.length));
  const changed = Boolean(marker && marker.signature !== recordSignature(holdings, transactions, cashflow));
  const knownIds = new Set(marker?.transactionIds ?? []);
  const newTransactions = marker
    ? transactions.filter(({ id }) => !knownIds.has(id)).length
    : transactions.length;
  const daysSinceExport = marker ? Math.max(0, (now - Date.parse(marker.exportedAt)) / 86_400_000) : null;
  const needsAttention = hasRecords && (!marker || (changed && (newTransactions >= 3 || (daysSinceExport ?? 0) >= 7)));
  return { hasRecords, changed, newTransactions, daysSinceExport, needsAttention };
}
