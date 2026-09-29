import test from "node:test";
import assert from "node:assert/strict";
import { backupReminder, parseBackupMarker, recordSignature } from "../src/backup-reminder.ts";

const today = Date.parse("2026-09-28T00:00:00Z");
const holding = { id: "one", symbol: "0050", name: "元大台灣50", category: "台股", shares: 10, avgPrice: 100,
  currentPrice: 110, sector: "ETF", divRate: 0, estDivMonth: "", quoteMode: "AUTO" };
const row = (id) => ({ id, symbol: "0050", category: "台股", name: "元大台灣50", type: "BUY", date: "2026-09-27", shares: 1, price: 100 });

test("empty new browser gets the introductory notice without backup nag", () => {
  assert.equal(backupReminder(null, [], [], today).needsAttention, false);
  assert.equal(backupReminder(null, [holding], [], today).needsAttention, true);
});

test("market quote changes do not mark an exported portfolio as changed", () => {
  const marker = { exportedAt: new Date(today).toISOString(), signature: recordSignature([holding], [row("a")]), transactionIds: ["a"] };
  const updatedQuote = { ...holding, currentPrice: 120, priceUpdatedAt: new Date(today).toISOString(), quoteSource: "Nasdaq" };
  assert.deepEqual(backupReminder(marker, [updatedQuote], [row("a")], today).changed, false);
});

test("third new trade or old export with any change prompts for backup", () => {
  const marker = { exportedAt: new Date(today - 86_400_000).toISOString(), signature: recordSignature([holding], [row("a")]), transactionIds: ["a"] };
  const transactions = [row("d"), row("c"), row("b"), row("a")];
  assert.equal(backupReminder(marker, [holding], transactions, today).newTransactions, 3);
  assert.equal(backupReminder(marker, [holding], transactions, today).needsAttention, true);
  assert.equal(backupReminder(marker, [holding], [row("b"), row("a")], today).needsAttention, false);
  assert.equal(backupReminder(marker, [holding], [row("b"), row("a")], today + 7 * 86_400_000).needsAttention, true);
});

test("manual holding change is noticed, malformed metadata is rejected", () => {
  const marker = { exportedAt: new Date(today - 8 * 86_400_000).toISOString(), signature: recordSignature([holding], []), transactionIds: [] };
  assert.equal(backupReminder(marker, [{ ...holding, shares: 11 }], [], today).needsAttention, true);
  assert.equal(parseBackupMarker(JSON.stringify(marker)).signature, marker.signature);
  assert.equal(parseBackupMarker('{"exportedAt":"oops"}'), null);
});
