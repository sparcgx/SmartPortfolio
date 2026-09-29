import test from "node:test";
import assert from "node:assert/strict";
import { holdingFreshness, fxFreshness } from "../src/freshness.ts";

const now = Date.parse("2026-09-28T04:00:00Z");
const auto = { category: "台股", quoteMode: "AUTO", quoteCheckedAt: "2026-09-28T03:55:00Z",
  priceUpdatedAt: "2026-09-28T03:50:00Z", quoteMarketTimestampKnown: true, quoteIsRealtime: false };

test("exchange timestamp and recent check identify recent quote", () => {
  assert.equal(holdingFreshness(auto, now), "recent");
});

test("fresh request for an old last trade does not claim fresh market price", () => {
  assert.equal(holdingFreshness({ ...auto, priceUpdatedAt: "2026-09-24T03:50:00Z" }, now), "older");
});

test("Nasdaq checked now with no trusted trade time remains unknown unless realtime", () => {
  const us = { ...auto, category: "美股", quoteMarketTimestampKnown: false };
  assert.equal(holdingFreshness(us, now), "unknown");
  assert.equal(holdingFreshness({ ...us, quoteIsRealtime: true }, now), "recent");
  assert.equal(holdingFreshness({ ...us, quoteIsRealtime: true, quoteCheckedAt: "2026-09-27T03:00:00Z" }, now), "older");
});

test("legacy saved quotes, funds and manual quotes are labeled conservatively", () => {
  assert.equal(holdingFreshness({ ...auto, quoteCheckedAt: undefined }, now), "unknown");
  assert.equal(holdingFreshness({ ...auto, quoteMode: "MANUAL" }, now), "manual");
  assert.equal(holdingFreshness({ ...auto, category: "公募基金" }, now), "manual");
});

test("reference FX date must be present and recent", () => {
  assert.equal(fxFreshness(null, now), "unknown");
  assert.equal(fxFreshness("2026-09-28", now), "recent");
  assert.equal(fxFreshness("2026-09-20", now), "older");
});
