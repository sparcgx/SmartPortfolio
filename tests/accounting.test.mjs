import test from "node:test";
import assert from "node:assert/strict";
import { assessTrade, replayPosition } from "../src/accounting.ts";

const holding = (shares, avgPrice) => ({ shares, avgPrice });
const trade = (id, date, type, shares, price) => ({
  id, date, type, shares, price, symbol: "0050", category: "台股", name: "測試",
});

test("backfilled buy replays before later sale using average cost", () => {
  const history = [trade("s", "2026-03-01", "SELL", 5, 18), trade("b", "2026-01-01", "BUY", 10, 10)];
  const result = assessTrade(holding(5, 10), history, trade("backfill", "2026-02-01", "BUY", 10, 20), "2026-09-27");
  assert.equal(result.mode, "replay");
  assert.equal(result.position.shares, 15);
  assert.equal(result.position.avgPrice, 15);
});

test("selling before first buy is rejected even when current balance suffices", () => {
  const result = assessTrade(holding(10, 10), [trade("b", "2026-05-01", "BUY", 10, 10)], trade("s", "2026-04-01", "SELL", 2, 15), "2026-09-27");
  assert.match(result.error, /當時持股不足/);
});

test("same day transactions follow their entry order", () => {
  const result = replayPosition([trade("sell", "2026-05-01", "SELL", 4, 15), trade("buy", "2026-05-01", "BUY", 10, 10)]);
  assert.equal(result.shares, 6);
  assert.equal(result.avgPrice, 10);
});

test("incomplete old history is protected; completing it does not double count", () => {
  const history = [trade("old", "2026-04-01", "BUY", 5, 10)];
  const incomplete = assessTrade(holding(10, 10), history, trade("extra", "2026-02-01", "BUY", 3, 10), "2026-09-27");
  assert.match(incomplete.error, /尚未對齊/);
  const completed = assessTrade(holding(10, 10), history, trade("missing", "2026-02-01", "BUY", 5, 10), "2026-09-27");
  assert.equal(completed.mode, "document");
  assert.equal(completed.position.shares, 10);
});

test("existing manually entered position can still accept a current trade", () => {
  const result = assessTrade(holding(10, 12), [], trade("new", "2026-09-27", "BUY", 10, 18), "2026-09-27");
  assert.equal(result.mode, "append");
  assert.equal(result.position.avgPrice, 15);
});

test("full sale resets cost before later repurchase; dividends do not change shares", () => {
  const result = replayPosition([
    { ...trade("d", "2026-09-01", "DIVIDEND", 0, 0), amount: 12 },
    trade("b2", "2026-06-01", "BUY", 3, 30),
    trade("s", "2026-05-01", "SELL", 10, 20),
    trade("b", "2026-04-01", "BUY", 10, 10),
  ]);
  assert.equal(result.shares, 3);
  assert.equal(result.avgPrice, 30);
});
