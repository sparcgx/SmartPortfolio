import type { Transaction } from './types';

export default function CostVerificationButton({ row, disabled, onVerify }: {
  row: Transaction; disabled: boolean; onVerify: (row: Transaction, verified: boolean) => void;
}) {
  const verified = row.costsVerified === true;
  return <button type="button" className="transaction-badge min-h-11 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
    data-status={verified ? 'verified' : 'pending'} disabled={disabled} aria-pressed={verified}
    aria-label={`${row.date} ${row.name} 費稅${verified ? '已核對，點擊改為待核對' : '待核對，點擊標記已核對'}`}
    title={verified ? '點擊改回待核對' : '確認金額、手續費及稅額後，點擊標記已核對'}
    onClick={() => onVerify(row, !verified)}>{verified ? '已核對' : '待核對'}</button>;
}
