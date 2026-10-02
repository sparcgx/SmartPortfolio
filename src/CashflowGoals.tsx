import { useEffect, useMemo, useState } from 'react';
import type { CashflowTools, DisplayCurrency, Holding, Transaction } from './types';
import { cashflowProjection, instrumentKey } from './cashflow-tools';
import { dividendCurrency } from './dividend-income';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function CashflowGoals({holdings,transactions,settings,today,disabled,onSave}: {
  holdings:Holding[];transactions:Transaction[];settings:CashflowTools;today:string;disabled:boolean;onSave:(s:CashflowTools)=>boolean;
}) {
  const [currency,setCurrency] = useState<DisplayCurrency>('TWD');
  const [targets,setTargets] = useState(settings.monthlyTargets);
  const [plans,setPlans] = useState(settings.plans);
  const savedKey = JSON.stringify([settings.monthlyTargets,settings.plans]);
  useEffect(()=>{setTargets(settings.monthlyTargets);setPlans(settings.plans);},[savedKey]);
  const draft = {...settings,monthlyTargets:targets,plans};
  const report = useMemo(()=>cashflowProjection(holdings,transactions,draft,currency,today),[holdings,transactions,targets,plans,currency,today]);
  const money=(n:number|null)=>n===null||!Number.isFinite(n)?'—':`${currency==='TWD'?'NT$':'US$'} ${n.toLocaleString('zh-TW',{maximumFractionDigits:2})}`;
  const choices = holdings.filter(h=>dividendCurrency(h.category)===currency);
  const unused = choices.find(h=>!plans.some(p=>instrumentKey(p)===instrumentKey(h)));
  const changed = savedKey!==JSON.stringify([targets,plans]);
  const percent = report.actualMonthly!==null&&report.target>0 ? report.actualMonthly/report.target*100 : null;
  return <form className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6" onSubmit={e=>{e.preventDefault();onSave(draft);}}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">現金流目標</h2><label className="flex items-center gap-2 text-sm">原幣<select className="min-h-11 rounded-lg border border-border bg-background px-3" value={currency} onChange={e=>setCurrency(e.target.value as DisplayCurrency)}><option value="TWD">台幣</option><option value="USD">美元</option></select></label></div>
    <div className="flex flex-wrap items-end gap-3"><label className="block min-w-48 space-y-2 text-sm font-medium"><span>每月股息目標（{currency}）</span><Input type="number" inputMode="decimal" min="0" max="1000000000000" step="any" value={targets[currency]||''} placeholder="輸入你的目標" disabled={disabled} onChange={e=>setTargets({...targets,[currency]:Number(e.target.value)})}/></label><Button type="submit" disabled={disabled||!changed}>儲存目標與投入配置</Button><span className="text-sm text-muted-foreground" role="status">{changed?'試算中，尚未儲存':'設定已保存於此裝置'}</span></div>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl bg-muted/40 p-4"><p className="text-sm text-muted-foreground">實收月均 · 近 12 個完整月份</p><strong className={`mt-2 block text-2xl ${report.actualMonthly===null||report.actualMonthly===0?'value-neutral':report.actualMonthly>0?'cash-income':'cash-expense'}`}>{money(report.actualMonthly)}</strong><p className="mt-2 text-sm">{report.count?`${report.count} 筆 · 合計 ${money(report.actualNet)}`:'尚無此期間實收紀錄'}</p>{report.unverified>0&&<p className="mt-1 text-sm status-pending">{report.unverified} 筆費稅待核對</p>}</div>
      <div className="rounded-xl bg-muted/40 p-4"><p className="text-sm text-muted-foreground">目前持股預估月均 · 稅前</p><strong className="mt-2 block text-2xl">{money(report.forecastMonthly)}</strong><p className="mt-2 text-sm text-muted-foreground">現價 × 持股數 × 手動股息試算率 ÷ 12</p></div>
      <div className="rounded-xl bg-muted/40 p-4"><p className="text-sm text-muted-foreground">距目標的預估月均缺口</p><strong className={`mt-2 block text-2xl ${report.target>0&&report.gap===0?'cash-income':'status-pending'}`}>{report.target>0?money(report.gap):'尚未設定'}</strong><p className="mt-2 text-sm text-muted-foreground">{report.target>0?`以預估月均比較；目標 ${money(report.target)}`:'請先填寫每月股息目標'}</p></div>
    </div>
    <div><div className="mb-2 flex flex-wrap justify-between gap-2 text-sm"><span>實收達成率（實收月均 ÷ 目標）</span><strong>{percent===null?'—':`${percent.toFixed(1)}%`}</strong></div><progress className="h-3 w-full accent-[var(--primary)]" aria-label="實收股息目標達成率" max={100} value={percent===null?0:Math.max(0,Math.min(100,percent))}/><p className="mt-2 text-sm text-muted-foreground">{report.start} 至 {report.end}；只計已登記的實收淨額，資料不完整時不代表真正收入。台幣與美元分開，不套用目前匯率。</p></div>
    {report.invalidCount>0&&<p role="alert" className="text-sm status-pending">有 {report.invalidCount} 筆異常股息未納入，請先核對交易。</p>}
    <div className="border-t border-border pt-5"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">多標的定額達標試算</h3><Button type="button" variant="outline" disabled={disabled||!unused||plans.length>=100} onClick={()=>{if(unused)setPlans([...plans,{category:unused.category,symbol:unused.symbol,monthlyAmount:0}]);}}>新增投入標的</Button></div>
      {report.plans.length===0?<p className="py-5 text-sm text-muted-foreground">{choices.length?'選擇持股並填寫每月投入，試算需要多久補足缺口。':'此幣別尚無持股，請先建立持股資料。'}</p>:<Table className="mt-3 min-w-[620px]"><TableHeader><TableRow>{['投入標的','每月投入','手動試算率','每月新增月均股息','操作'].map(s=><TableHead key={s}>{s}</TableHead>)}</TableRow></TableHeader><TableBody>{report.plans.map(p=>{
        const key=instrumentKey(p);
        return <TableRow key={key}><TableCell><select aria-label={`${p.symbol} 投入標的`} className="min-h-11 max-w-52 rounded border border-border bg-background px-2" value={key} disabled={disabled} onChange={e=>{const h=choices.find(h=>instrumentKey(h)===e.target.value);if(h)setPlans(plans.map(row=>instrumentKey(row)===key?{...row,category:h.category,symbol:h.symbol}:row));}}>
          {!choices.some(h=>instrumentKey(h)===key)&&<option value={key}>{p.symbol}（持股已不存在）</option>}{choices.map(h=><option key={h.id} value={instrumentKey(h)} disabled={instrumentKey(h)!==key&&plans.some(row=>instrumentKey(row)===instrumentKey(h))}>{h.name} / {h.symbol}</option>)}</select>{p.error&&<p className="mt-1 text-sm status-pending">{p.error}</p>}</TableCell>
          <TableCell><Input className="min-w-28" aria-label={`${p.symbol} 每月投入`} type="number" inputMode="decimal" min="0" max="1000000000000" step="any" value={p.monthlyAmount||''} placeholder="0" disabled={disabled} onChange={e=>setPlans(plans.map(row=>instrumentKey(row)===key?{...row,monthlyAmount:Number(e.target.value)}:row))}/></TableCell>
          <TableCell>{p.holding?`${p.holding.divRate}%`:'—'}</TableCell><TableCell className="cash-income">{p.error?'—':money(p.monthlyIncomeAdded)}</TableCell><TableCell><Button type="button" variant="ghost" disabled={disabled} onClick={()=>setPlans(plans.filter(row=>instrumentKey(row)!==key))}>移除</Button></TableCell></TableRow>;
      })}</TableBody></Table>}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">{[['每月投入合計',money(report.monthlyInvestment)],['預估達標時間',report.tooLong?'超過 100 年':report.months===null?'無法估算':report.months===0?'預估已達標':`${Math.floor(report.months/12)} 年 ${report.months%12} 個月`],['達標前新增投入',money(report.totalInvestment)]].map(([label,value])=><div key={label} className="rounded-xl bg-muted/40 p-4"><p className="text-sm text-muted-foreground">{label}</p><strong className="mt-2 block text-xl">{value}</strong></div>)}</div>
      {report.incomplete&&<p className="mt-3 text-sm status-pending">有未設定手動股息試算率、現價缺漏或持股已刪除的項目；已暫停達標時間估算，避免產生不完整結果。</p>}
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">假設股價與手動試算率固定、每月月底投入且預算全數買入；不計費稅、整股限制、匯率或股息再投入。估計值非官方公告、非報酬保證，也不會新增交易。官方殖利率不直接當作現金股息率。</p>
    </div>
  </form>;
}
