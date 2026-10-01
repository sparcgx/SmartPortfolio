import test from 'node:test';
import assert from 'node:assert/strict';
import { instrumentTransactions, sameInstrument, instrumentHash, instrumentFromHash, transactionCash } from '../src/instrument-history.ts';

const target = { category: '台股', symbol: '00919' };
const row = { ...target, id: 'buy', name: '測試標的', date: '2026-09-01', type: 'BUY', shares: 100, price: 20, fee: 10, tax: 0 };

test('details include only exact symbol and market, never names or substrings', () => {
  const rows = [row, { ...row, id: 'us', category: '美股' }, { ...row, id: 'fund', category: '公募基金' }, { ...row, id: 'other', symbol: '00919A' }];
  assert.deepEqual(instrumentTransactions(rows, target).map(r => r.id), ['buy']);
  assert.equal(sameInstrument({category:'美股',symbol:' aapl '},{category:'美股',symbol:'AAPL'}),true);
});
test('all transaction types and historical names remain, even without a holding', () => {
  const rows = [row, { ...row, id: 'sell', type: 'SELL', name: '舊名稱' }, { ...row, id: 'dividend', type: 'DIVIDEND', amount: 100 }];
  assert.equal(instrumentTransactions(rows, target).length, 3);
  assert.deepEqual(instrumentTransactions([], target), []);
});
test('dates descend and equal-date order remains stable without source mutation', () => {
  const rows = [row, { ...row, id: 'late', date: '2026-10-01' }, { ...row, id: 'same' }];
  const before = structuredClone(rows);
  assert.deepEqual(instrumentTransactions(rows, target).map(r => r.id), ['late', 'buy', 'same']);
  assert.deepEqual(rows, before);
});
test('edited and deleted source rows are immediately reflected with no duplicate store', () => {
  assert.equal(instrumentTransactions([{ ...row, price: 30 }], target)[0].price, 30);
  assert.equal(instrumentTransactions([row].filter(r => r.id !== 'buy'), target).length, 0);
});
test('detail routes round-trip market and escaped symbol; malformed routes rejected', () => {
  const fund = { category: '公募基金', symbol: 'AT / 美元+A&B' };
  assert.deepEqual(instrumentFromHash(instrumentHash(fund)), fund);
  for (const hash of ['', '#other', '#instrument?symbol=AAPL', '#instrument?market=未知&symbol=AAPL', '#instrument?market=美股&symbol=%20']) assert.equal(instrumentFromHash(hash), null);
});
test('native cash amounts include fees and taxes and preserve actual outflow direction', () => {
  assert.equal(transactionCash(row), -2010);
  assert.equal(transactionCash({ ...row, type: 'SELL', tax: 30 }), 1960);
  assert.equal(transactionCash({ ...row, type: 'DIVIDEND', amount: 100, tax: 20 }), 70);
  assert.equal(transactionCash({ ...row, category: '美股', fxRate: 99 }), -2010);
  assert.equal(transactionCash({ ...row, price: NaN }), null);
  assert.equal(transactionCash({ ...row, fee: -1 }), null);
});
