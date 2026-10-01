import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Render the real React view without a browser or user data.
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
after(() => server.close());
const { default: Page } = await server.ssrLoadModule('/src/InstrumentTransactions.tsx');
const instrument = { category: '美股', symbol: 'AAPL' };
const tx = { ...instrument, id: '1', name: 'Apple', type: 'BUY', date: '2026-09-01', shares: 10, price: 100, fee: 5, tax: 0 };
const render = (transactions, storageReady = true) => renderToStaticMarkup(createElement(Page, {
  instrument, holdings: [], transactions, storageReady, onBack() {}, onEdit() {},
}));

test('detail UI excludes other symbols and markets, shows all three types and native values', () => {
  const html = render([tx, { ...tx, id: '2', type: 'SELL' }, { ...tx, id: '3', type: 'DIVIDEND', amount: 100 },
    { ...tx, id: '4', name: 'Must not appear', category: '台股' }, { ...tx, id: '5', name: 'Also excluded', symbol: 'MSFT' }]);
  assert.match(html, /Apple/); assert.match(html, /3 筆交易/);
  assert.match(html, /買入 1 筆／賣出 1 筆／股息 1 筆/);
  assert.match(html, /USD -1,005/); assert.match(html, /USD 95/);
  assert.doesNotMatch(html, /Must not appear|Also excluded/);
  assert.match(html, /返回原頁面/); assert.match(html, /overflow-x-auto/);
});
test('detail empty state and storage-read failure remain safe and readable', () => {
  assert.match(render([]), /此標的尚無交易紀錄/);
  const html = render([tx], false);
  assert.equal((html.match(/disabled=""/g) || []).length, 2);
  assert.match(html, /aria-labelledby="instrument-title"/);
});
