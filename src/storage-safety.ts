import type { StoredPortfolio } from './types';

type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;
export const RESTORE_RECOVERY_KEY = 'smartportfolio:recovery:before-restore:v1';

export function savePortfolio(storage: StorageAccess, key: string, data: StoredPortfolio) {
  storage.setItem(key, JSON.stringify(data));
}

export function verifyTransactionCosts(storage: StorageAccess, key: string, recoveryKey: string,
  current: StoredPortfolio, id: string, verified: boolean, appVersion: string, loaded: boolean) {
  if (!loaded) throw new Error('資料尚未安全載入');
  const rows = current.transactions.filter(row => row.id === id);
  if (rows.length !== 1) throw new Error('交易不存在或識別碼重複');
  if ([rows[0].fee ?? 0, rows[0].tax ?? 0].some(value => !Number.isFinite(value) || value < 0)) throw new Error('費稅欄位無效，請先編輯修正');
  const next = { ...current, transactions: current.transactions.map(row => row.id === id ? { ...row, costsVerified: verified } : row) };
  storage.setItem(recoveryKey, JSON.stringify({ format: 'smartportfolio-backup', backupVersion: 1,
    appVersion, exportedAt: new Date().toISOString(), data: current }));
  savePortfolio(storage, key, next);
  return next;
}

// Persist the current in-memory state (including unsaved changes) before replacement.
// If snapshot persistence fails, the primary record is never touched.
export function restoreWithSnapshot(storage: StorageAccess, key: string,
  current: StoredPortfolio, next: StoredPortfolio, appVersion: string, loaded: boolean) {
  const raw = storage.getItem(key);
  const snapshot = loaded
    ? JSON.stringify({ format: 'smartportfolio-backup', backupVersion: 1,
        appVersion, exportedAt: new Date().toISOString(), data: current })
    : raw;
  if (snapshot !== null) storage.setItem(RESTORE_RECOVERY_KEY, snapshot);
  savePortfolio(storage, key, next);
}
