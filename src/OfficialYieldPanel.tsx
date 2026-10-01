import type { Holding } from './types';
import type { Instrument } from './instrument-history';
import InstrumentLink from './InstrumentLink';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function OfficialYieldPanel({holdings,refreshing,error,consent,onRefresh,onOpen}: {
  holdings:Holding[];refreshing:boolean;error:string|null;consent:boolean;onRefresh:()=>void;onOpen:(i:Instrument)=>void;
}) {
  return <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">官方殖利率</h2><Button variant="outline" disabled={refreshing || !holdings.length} onClick={onRefresh}>{refreshing ? '查詢中…' : consent ? '更新官方殖利率' : '允許查詢並更新'}</Button></div>
    <p className="text-sm text-muted-foreground">依官方來源口徑顯示，附資料日與查詢時間。不同口徑不混排；數值不代表未來配息。股息日曆仍使用下方的手動試算率。</p>
    {!consent && <p className="text-sm status-pending">同意後可查詢；啟用自動更新時每小時查詢一次。僅傳送股票／ETF 的市場及代號。</p>}
    {error && <p role="status" className="text-sm status-pending">{error}</p>}
    {!holdings.length ? <p className="text-sm text-muted-foreground">建立持股後可查詢官方殖利率。</p> : <Table className="min-w-[760px]"><TableHeader><TableRow>{['標的','官方殖利率','來源／計算口徑','資料日期／查詢時間'].map(s=><TableHead key={s}>{s}</TableHead>)}</TableRow></TableHeader><TableBody>{holdings.map(h => {
      const info = h.officialYield;
      return <TableRow key={h.id}><TableCell><InstrumentLink instrument={h} onOpen={onOpen}/><p className="text-sm text-muted-foreground">{h.category}</p></TableCell>
        <TableCell><strong className={info?.rate != null ? 'cash-income text-lg' : 'status-pending'}>{info?.rate != null ? `${info.rate.toLocaleString('zh-TW',{maximumFractionDigits:4})}%` : '—'}</strong><p className="mt-1 text-sm text-muted-foreground">{info?.status === 'available' ? '官方值' : info?.status === 'error' && info.rate != null ? '上次成功值' : info?.status === 'error' ? '來源暫時無法取得' : info ? '官方值未提供' : '尚未查詢'}</p></TableCell>
        <TableCell className="max-w-96 whitespace-normal"><p>{info?.sourceUrl ? <a className="text-primary underline underline-offset-4" href={info.sourceUrl} target="_blank" rel="noreferrer">{info.source}</a> : info?.source ?? '—'}</p><p className="mt-1 text-sm text-muted-foreground">{info?.basis}</p>{info?.message && <p className="mt-1 text-sm status-pending">{info.message}</p>}</TableCell>
        <TableCell className="text-sm"><p>{info?.asOf ?? (info ? '官方未提供資料日' : '—')}</p><p className="mt-1 text-muted-foreground">{info ? `查詢 ${new Date(info.checkedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})}` : ''}</p></TableCell>
      </TableRow>;
    })}</TableBody></Table>}
  </div>;
}
