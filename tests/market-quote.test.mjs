import test from "node:test";
import assert from "node:assert/strict";
import worker from "../dist/server/index.js";

test("latest request cannot label a previous close or textual false as realtime", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("frankfurter")) return Response.json({ rate: 31.5, date: "2026-09-26" });
    if (url.includes("mis.twse.com.tw")) return Response.json({ msgArray: [{ c: "0050", z: "-", pz: "-", y: "100", tlong: Date.now(), d: "20260926", t: "13:30:00" }] });
    if (url.includes("api.nasdaq.com")) return Response.json({ data: { primaryData: { lastSalePrice: "$200", isRealTime: "false", lastTradeTimestamp: "Sep 26, 2026 4:00 PM ET" } } });
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const request = new Request("https://example.test/api/market-data", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruments: [{ category: "台股", symbol: "0050" }, { category: "美股", symbol: "AAPL" }] }),
    });
    const response = await worker.fetch(request);
    assert.equal(response.status, 200);
    const snapshot = await response.json();
    assert.deepEqual(snapshot.errors, []);
    const tw = snapshot.quotes.find((quote) => quote.symbol === "0050");
    const us = snapshot.quotes.find((quote) => quote.symbol === "AAPL");
    assert.equal(tw.price, 100);
    assert.equal(tw.isRealtime, false);
    assert.equal(tw.marketTimestampKnown, false);
    assert.equal(us.isRealtime, false);
    assert.equal(us.marketTimestampKnown, false);
    assert.equal(us.providerTimestamp, "Sep 26, 2026 4:00 PM ET");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
