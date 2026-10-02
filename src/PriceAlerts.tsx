import { useState } from 'react';
import type { CashflowTools, Holding, PriceAlert, Transaction } from './types';
import { instrumentKey, priceAlertStatus } from './cashflow-tools';
import type { Instrument } from './instrument-history';
import InstrumentLink from './InstrumentLink';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const BASIS = {COST:'平均持有成本',LAST_BUY:'最後一次買入價',CUSTOM:'自訂價格'};
const STATUS = {disabled:'已暫停',missing:'找不到唯一的持股', 'no-target':'尚無有效參考價',stale:'行情較舊／手動價格，暫不觸發',inside:'價格在提醒範圍內',outside:'尚未進入範圍'};
export default function PriceAlerts({holdings,transactions,settings,disabled,now,online,onSave,onOpen}: {
  holdings:Holding[];transactions:Transaction[];settings:CashflowTools;disabled:boolean;now:number;online:boolean;onSave:(s:CashflowTools)=>boolean;onOpen:(i:Instrument)=>void;
}) {
  const [editing,setEditing] = useState<PriceAlert|null>(null);
  const [asset,setAsset] = useState('');
  const [basis,setBasis] = useState<PriceAlert['basis']>('COST');
  const [price,setPrice] = useState('');
  const [tolerance,setTolerance] = useState('1');
  const [deleting,setDeleting] = useState<PriceAlert|null>(null);
  const options=holdings.filter(h=>h.category!=='公募基金');
  const reset=()=>{setEditing(null);setAsset('');setBasis('COST');setPrice('');setTolerance('1');};
  return <details className="rounded-2xl border border-border bg-card p-4 sm:p-5"><summary className="min-h-11 cursor-pointer py-2 font-bold">股價提醒 · {settings.alerts.filter(a=>a.enabled).length} 項啟用</summary>
    <p className="mt-2 text-sm text-muted-foreground">僅在頁面開啟且有近期行情時提示；關閉 App 不會背景推播。價格進入參考價上下範圍時提醒一次，離開後再進入才重新提醒。</p>
    {!online&&<p className="mt-2 text-sm status-pending">裝置離線，已停止觸發；舊價格與提醒設定保留。</p>}
    <div className="mt-4 grid gap-3 lg:grid-cols-2">{settings.alerts.map(a=>{
      const s=priceAlertStatus(a,holdings,transactions,now);const currency=a.category==='美股'?'USD':'TWD';
      const money=(n:number|null)=>n===null?'—':`${currency} ${n.toLocaleString('zh-TW',{maximumFractionDigits:4})}`;
      return <div key={a.id} className="rounded-xl bg-muted/40 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><InstrumentLink instrument={{...a,name:s.holding?.name??a.symbol}} onOpen={onOpen}/><span className={`text-sm ${s.status==='inside'&&online?'cash-income':'text-muted-foreground'}`}>{!online&&a.enabled?'離線暫停':STATUS[s.status as keyof typeof STATUS]}</span></div>
        <p className="mt-2 text-sm">{BASIS[a.basis]} {money(s.target)} · ±{a.tolerancePct}%</p><p className="mt-1 text-sm">目前 {money(s.holding?.currentPrice??null)}{s.distance!==null?` · 距參考價 ${s.distance>=0?'+':''}${s.distance.toFixed(2)}%`:''}</p>
        <p className="mt-1 text-sm text-muted-foreground">行情查詢：{s.holding?.quoteCheckedAt?new Date(s.holding.quoteCheckedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'尚未查詢'}</p>
        {a.lastTriggeredAt&&<p className="mt-1 text-sm text-muted-foreground">上次提醒：{new Date(a.lastTriggeredAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})}</p>}
        <div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={disabled} aria-pressed={a.enabled} onClick={()=>onSave({...settings,alerts:settings.alerts.map(row=>row.id===a.id?{...row,enabled:!row.enabled,inside:false,lastObservation:null}:row)})}>{a.enabled?'暫停':'啟用'}</Button><Button type="button" variant="outline" disabled={disabled} onClick={()=>{setEditing(a);setAsset(instrumentKey(a));setBasis(a.basis);setPrice(a.customPrice?String(a.customPrice):'');setTolerance(String(a.tolerancePct));}}>編輯</Button><Button type="button" variant="ghost" disabled={disabled} onClick={()=>setDeleting(a)}>刪除</Button></div></div>;
    })}</div>
    <form className="mt-5 space-y-3 border-t border-border pt-4" onSubmit={e=>{
      e.preventDefault();const h=options.find(h=>instrumentKey(h)===asset);if(!h)return;
      const row:PriceAlert={id:editing?.id??crypto.randomUUID(),category:h.category,symbol:h.symbol,basis,customPrice:basis==='CUSTOM'?Number(price):0,tolerancePct:Number(tolerance),enabled:editing?.enabled??true,inside:false,lastObservation:null,lastTriggeredAt:editing?.lastTriggeredAt??null};
      if(onSave({...settings,alerts:editing?settings.alerts.map(a=>a.id===editing.id?row:a):[...settings.alerts,row]}))reset();
    }}><h3 className="font-semibold">{editing?'編輯價格提醒':'新增價格提醒'}</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="space-y-2 text-sm"><span>股票／ETF</span><select required disabled={disabled} className="min-h-11 w-full rounded-lg border border-border bg-background px-2" value={asset} onChange={e=>setAsset(e.target.value)}><option value="">選擇持股</option>{options.map(h=><option key={h.id} value={instrumentKey(h)}>{h.name} / {h.symbol}（{h.category}）</option>)}</select></label>
      <label className="space-y-2 text-sm"><span>參考價格</span><select disabled={disabled} className="min-h-11 w-full rounded-lg border border-border bg-background px-2" value={basis} onChange={e=>setBasis(e.target.value as PriceAlert['basis'])}>{Object.entries(BASIS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      {basis==='CUSTOM'&&<label className="space-y-2 text-sm"><span>自訂價格（標的原幣）</span><Input type="number" min="0.00000001" max="1000000000000" step="any" required disabled={disabled} value={price} onChange={e=>setPrice(e.target.value)}/></label>}
      <label className="space-y-2 text-sm"><span>接近範圍 ±%</span><Input type="number" min="0.01" max="50" step="any" required disabled={disabled} value={tolerance} onChange={e=>setTolerance(e.target.value)}/></label>
    </div><div className="flex gap-2"><Button type="submit" disabled={disabled||!asset||(!editing&&settings.alerts.length>=100)}>{editing?'儲存修改':'新增提醒'}</Button>{editing&&<Button type="button" variant="outline" onClick={reset}>取消編輯</Button>}</div>{!options.length&&<p className="text-sm text-muted-foreground">請先建立股票／ETF 持股；手動基金淨值不提供自動提醒。</p>}</form>
    <AlertDialog open={Boolean(deleting)} onOpenChange={open=>{if(!open)setDeleting(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>刪除 {deleting?.symbol} 的價格提醒？</AlertDialogTitle><AlertDialogDescription>只刪除此提醒，不影響持股與交易紀錄。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={e=>{if(deleting&&!onSave({...settings,alerts:settings.alerts.filter(a=>a.id!==deleting.id)}))e.preventDefault();else setDeleting(null);}}>確認刪除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </details>;
}
