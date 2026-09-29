import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { savePortfolio, restoreWithSnapshot, RESTORE_RECOVERY_KEY } from '../src/storage-safety.ts';
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === './data' && context.parentURL?.endsWith('/src/backup.ts')) return nextResolve('./data.ts', context);
  return nextResolve(specifier, context);
} });
const { parsePortfolioBackup, createPortfolioBackup } = await import('../src/backup.ts');
hooks.deregister();
const current = parsePortfolioBackup({holdings: [], transactions: []}).data;
const next = {...current, preferences: {...current.preferences, currentTheme:'light'}};
const memory = (failKey) => {
  const values = new Map([['main', JSON.stringify(current)]]);
  return { getItem: k => values.get(k) ?? null, setItem(k,v) { if(k === failKey) throw new Error('quota'); values.set(k,v); } };
};
test('restore keeps an importable snapshot of unsaved session changes', () => {
  const s = memory(); restoreWithSnapshot(s, 'main', next, current, '1.6.4', true);
  assert.deepEqual(parsePortfolioBackup(JSON.parse(s.getItem(RESTORE_RECOVERY_KEY))).data, next);
  assert.deepEqual(JSON.parse(s.getItem('main')), current);
});
test('snapshot failure prevents replacement', () => {
  const s = memory(RESTORE_RECOVERY_KEY);
  assert.throws(() => restoreWithSnapshot(s, 'main', current, next, '1.6.4', true));
  assert.deepEqual(JSON.parse(s.getItem('main')), current);
});
test('primary write failure retains original and recovery snapshot', () => {
  const s = memory('main');
  assert.throws(() => restoreWithSnapshot(s, 'main', current, next, '1.6.4', true));
  assert.deepEqual(JSON.parse(s.getItem('main')), current);
  assert.deepEqual(parsePortfolioBackup(JSON.parse(s.getItem(RESTORE_RECOVERY_KEY))).data, current);
  assert.throws(() => savePortfolio(s, 'main', next));
});
test('unreadable portfolio is preserved byte for byte before restore', () => {
  const s = memory(); s.setItem('main', '{broken');
  restoreWithSnapshot(s, 'main', current, next, '1.6.4', false);
  assert.equal(s.getItem(RESTORE_RECOVERY_KEY), '{broken');
});
test('backup round trip preserves holdings, fees, dividends, metadata and settings', () => {
  const data = parsePortfolioBackup({...next,
    holdings:[{id:'h',symbol:'0050',name:'測試',category:'台股',shares:10.5,avgPrice:50,currentPrice:60,quoteCheckedAt:'2026-09-28T00:00:00Z',quoteMarketTime:'市場時間',quoteMarketTimestampKnown:true,quoteIsRealtime:true}],
    transactions:[{id:'b',symbol:'0050',name:'測試',category:'台股',type:'BUY',date:'2026-01-01',shares:10.5,price:50,fee:20,tax:0,fxRate:31.5,costsVerified:true,note:'紀錄'}, {id:'d',symbol:'0050',name:'測試',category:'台股',type:'DIVIDEND',date:'2026-02-01',amount:123.45}]
  }).data;
  const restored = parsePortfolioBackup(JSON.parse(JSON.stringify(createPortfolioBackup(data, '1.6.4'))));
  assert.deepEqual(restored.data, data);
  assert.equal(restored.appVersion, '1.6.4');
});
test('legacy backup receives defaults and malformed input is rejected', () => {
  assert.equal(parsePortfolioBackup({schemaVersion:1,holdings:[],transactions:[]}).data.schemaVersion, 3);
  assert.throws(() => parsePortfolioBackup({holdings:[{}],transactions:[]}));
});
