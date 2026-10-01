import { useEffect, useMemo, useRef } from 'react';
import type { Holding, Transaction } from './types';
import { instrumentTransactions, sameInstrument, transactionCash, type Instrument } from './instrument-history';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function InstrumentTransactions({ instrument, holdings, transactions, storageReady, onBack, onEdit }: {
  instrument: Instrument; holdings: Holding[]; transactions: Transaction[]; storageReady: boolean;
  onBack: () => void; onEdit: (row: Transaction, deleting: boolean) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const rows = useMemo(() => instrumentTransactions(transactions, instrument), [transactions, instrument]);
  const holding = holdings.find(row => sameInstrument(row, instrument));
  const name = holding?.name ?? rows[0]?.name ?? instrument.symbol;
  const currency = instrument.category === '美股' ? 'USD' : 'TWD';
  const money = (value: number | undefined | null) => value == null || !Number.isFinite(value) ? '—' :
    `${currency} ${value.toLocaleString('zh-TW', { maximumFractionDigits: 4 })}`;
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [instrument.category, instrument.symbol]);
  return <section aria-labelledby="instrument-title" className="instrument-details space-y-4">
    <Button type="button" variant="outline" onClick={onBack}>返回原頁面</Button>
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <p className="mb-2 text-sm font-medium text-primary">標的交易明細 · {instrument.category}</p>
      <h2 id="instrument-title" ref={heading} tabIndex={-1} className="break-words text-2xl font-bold outline-none">{name} <span className="font-mono text-primary">/ {instrument.symbol}</span></h2>
      <p className="mt-3 text-sm text-muted-foreground">全部期間 · {rows.length} 筆交易</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="transaction-badge" data-type="BUY">買入 {rows.filter(r => r.type === 'BUY').length} 筆</span>
        <span className="transaction-badge" data-type="SELL">賣出 {rows.filter(r => r.type === 'SELL').length} 筆</span>
        <span className="transaction-badge" data-type="DIVIDEND">股息 {rows.filter(r => r.type === 'DIVIDEND').length} 筆</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">只顯示此市場與代號的紀錄，依日期由新到舊排列；同一代號的歷史名稱變更仍保留。</p>
    </div>
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <p className="p-4 text-sm text-muted-foreground">金額以 {currency} 原幣顯示。買入為支出（含費稅），賣出及股息為收入（扣費稅）；收支金額不等於投資損益。</p>
      {rows.length === 0 ? <div role="status" className="px-5 pb-8 pt-4"><h3 className="font-semibold">此標的尚無交易紀錄</h3><p className="mt-2 text-sm text-muted-foreground">目前持股可能由手動建立或匯入而來；可返回原頁面登記交易。</p></div> :
        <Table className="min-w-[1040px] text-sm"><TableHeader className="bg-muted/70"><TableRow>
          {['日期', '類型', '標的名稱 / 代號', '數量', '成交價／股息毛額', '手續費', '稅額', '收支淨額', '費稅狀態', '備註', '操作'].map(label => <TableHead key={label} className="whitespace-nowrap px-4">{label}</TableHead>)}
        </TableRow></TableHeader><TableBody>{rows.map(row => {
          const cash = transactionCash(row);
          const direction = cash === null || cash === 0 ? 'neutral' : cash > 0 ? 'income' : 'expense';
          return <TableRow key={row.id} className="instrument-transaction-row" data-type={row.type}>
            <TableCell className="px-4 font-mono">{row.date}</TableCell>
            <TableCell><span className="transaction-badge" data-type={row.type}>{row.type === 'BUY' ? '買入' : row.type === 'SELL' ? '賣出' : '股息'}</span></TableCell>
            <TableCell><span className="block font-semibold">{row.name}</span><span className="font-mono text-muted-foreground">{row.symbol}</span></TableCell>
            <TableCell className="text-right tabular-nums">{row.type === 'DIVIDEND' ? '—' : row.shares?.toLocaleString('zh-TW', { maximumFractionDigits: 8 }) ?? '—'}</TableCell>
            <TableCell className="text-right tabular-nums">{money(row.type === 'DIVIDEND' ? row.amount : row.price)}</TableCell>
            <TableCell className="text-right tabular-nums">{money(row.fee ?? 0)}</TableCell>
            <TableCell className="text-right tabular-nums">{money(row.tax ?? 0)}</TableCell>
            <TableCell className="transaction-cash text-right font-semibold tabular-nums" data-direction={direction}>{cash !== null && cash > 0 ? '+' : ''}{money(cash)}<span className="block text-sm font-normal">{cash === null ? '金額待確認' : cash === 0 ? '收支平衡' : cash > 0 ? '收入' : '支出'}</span></TableCell>
            <TableCell><span className="transaction-badge" data-status={row.costsVerified ? 'verified' : 'pending'}>{row.costsVerified ? '已核對' : '待核對'}</span></TableCell>
            <TableCell className="max-w-56 whitespace-normal">{row.note || '—'}</TableCell>
            <TableCell><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={!storageReady} onClick={() => onEdit(row, false)}>編輯</Button><Button type="button" size="sm" variant="outline" disabled={!storageReady} onClick={() => onEdit(row, true)}>刪除</Button></div></TableCell>
          </TableRow>;
        })}</TableBody></Table>}
    </div>
  </section>;
}
