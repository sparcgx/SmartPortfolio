"use client";

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  Calculator,
  CalendarDays,
  Check,
  Coins,
  DatabaseBackup,
  Download,
  Edit2,
  Globe2,
  Grid2X2,
  Info,
  Layers3,
  List,
  Palette,
  PieChart,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { investmentPerformance } from "./performance";
import { RESTORE_RECOVERY_KEY, savePortfolio, restoreWithSnapshot } from "./storage-safety";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Toaster } from "@/components/ui/sonner";
import {
  createPortfolioBackup,
  parsePortfolioBackup,
  readSourceSchemaVersion,
  removeLegacyDemoRows,
} from "./backup";
import { backupReminder, parseBackupMarker, recordSignature, type BackupMarker } from "./backup-reminder";
import { assessTrade, assessHistoryChange, replayPosition, samePosition } from "./accounting";
import { FRESHNESS_LABELS, fxFreshness, holdingFreshness } from "./freshness";
import { THEMES } from "./data";
import {
  fetchMarketSnapshot,
  marketQuoteKey,
} from "./market-data";
import {
  FALLBACK_USD_RATE,
  createId,
  estimateTransactionCosts,
  formatMoney,
  formatNativeMoney,
  holdingCostTwd as calculateHoldingCostTwd,
  holdingValueTwd as calculateHoldingValueTwd,
  isValidHistoricalDate,
  localDateString,
  normalizeDividendMonths,
  transactionValueTwd as calculateTransactionValueTwd,
} from "./portfolio";
import type {
  Category,
  DisplayCurrency,
  Holding,
  MarketStyle,
  QuoteMode,
  StoredPortfolio,
  TabId,
  ThemeId,
  Transaction,
  TransactionType,
} from "./types";

declare global {
  interface ImportMetaEnv {
    readonly PROD: boolean;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface Document {
    modelContext?: {
      registerTool: (
        tool: {
          name: string;
          title?: string;
          description: string;
          inputSchema: object;
          annotations?: {
            readOnlyHint?: boolean;
            untrustedContentHint?: boolean;
          };
          execute: (input: unknown) => unknown | Promise<unknown>;
        },
        options?: { signal?: AbortSignal },
      ) => void | Promise<void>;
    };
  }
}

const APP_VERSION = "1.8.1";
const HISTORY_RECOVERY_KEY = "smartportfolio:recovery:before-history-change:v1";
const STORAGE_KEY = "smartportfolio:v1";
const BACKUP_MARKER_KEY = "smartportfolio:backup-marker:v1";
const LOCAL_NOTICE_KEY = "smartportfolio:local-notice:v1";
const BACKUP_SNOOZE_KEY = "smartportfolio:backup-snooze-until:v1";
const LEGACY_RECOVERY_KEY = "smartportfolio:recovery:before-demo-removal:v1.1.0";
const MARKET_REFRESH_INTERVAL_MS = 5 * 60 * 1_000;
const MANUAL_HOLDING_ID = "__manual_holding__";

interface TransactionUndoSnapshot {
  transactionId: string;
  transactionLabel: string;
  holdingId: string | null;
  previousHolding: Holding | null;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

const NAV_TABS: Array<{
  id: TabId;
  label: string;
  compactLabel: string;
  icon: typeof PieChart;
}> = [
  { id: "dashboard", label: "資產總覽", compactLabel: "總覽", icon: PieChart },
  { id: "holdings", label: "持股與基金明細", compactLabel: "持股", icon: Layers3 },
  { id: "transactions", label: "交易紀錄", compactLabel: "交易", icon: CalendarDays },
  { id: "dividends", label: "股息與產業分析", compactLabel: "分析", icon: BarChart3 },
  { id: "dca", label: "定期定額試算", compactLabel: "試算", icon: Calculator },
];

const CATEGORIES: Category[] = ["台股", "美股", "公募基金"];
const CATEGORY_COLORS: Record<Category, string> = {
  台股: "var(--chart-1)",
  美股: "var(--chart-2)",
  公募基金: "var(--chart-3)",
};

function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-border bg-card text-card-foreground shadow-sm ${className}`}
    >
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  valueClass = "",
  iconClass = "bg-primary/10 text-primary",
}: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  icon: ReactNode;
  valueClass?: string;
  iconClass?: string;
}) {
  return (
    <Panel className="overflow-hidden p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-muted-foreground">{label}</p>
          <div className={`mt-1 truncate text-xl font-bold sm:text-2xl ${valueClass}`}>
            {value}
          </div>
        </div>
        <div className={`shrink-0 rounded-xl border border-current/15 p-2.5 ${iconClass}`}>
          {icon}
        </div>
      </div>
      <div className="mt-3 truncate text-sm text-muted-foreground">{detail}</div>
    </Panel>
  );
}

function EmptyState({
  message,
  detail = "請調整搜尋文字或分類條件。",
  action,
}: {
  message: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center gap-2 p-8 text-center">
      <Search className="size-7 text-muted-foreground" />
      <p className="text-sm font-medium">{message}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

function backupFileStamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function downloadJsonFile(value: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function formatBackupDate(value: string | null) {
  if (!value) return "未記錄";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("zh-TW", { hour12: false });
}

export default function SmartPortfolio() {
  const isStandaloneFile =
    typeof window !== "undefined" && window.location.protocol === "file:";
  const isGithubPages = typeof window !== "undefined" && window.location.hostname === "sparcgx.github.io";
  const [currentTheme, setCurrentTheme] = useState<ThemeId>("dark");
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>("TWD");
  const [marketStyle, setMarketStyle] = useState<MarketStyle>("TW");
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [usdRate, setUsdRate] = useState(FALLBACK_USD_RATE);
  const [usdRateUpdatedAt, setUsdRateUpdatedAt] = useState<string | null>(null);
  const [lastMarketSyncAt, setLastMarketSyncAt] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [quoteConsent, setQuoteConsent] = useState(false);
  const [isMarketConsentOpen, setIsMarketConsentOpen] = useState(false);
  const [syncState, setSyncState] = useState<
    "idle" | "syncing" | "success" | "partial" | "error"
  >("idle");
  const [syncSummary, setSyncSummary] = useState({
    updated: 0,
    requested: 0,
    errors: 0,
  });
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [saveRetry, setSaveRetry] = useState(0);
  const [hasRestoreRecovery, setHasRestoreRecovery] = useState(false);
  const [freshnessNow, setFreshnessNow] = useState(() => Date.now());
  const [backupMarker, setBackupMarker] = useState<BackupMarker | null>(null);
  const [localNoticeDismissed, setLocalNoticeDismissed] = useState(false);
  const [backupSnoozeUntil, setBackupSnoozeUntil] = useState(0);
  const [isBackupDialogOpen, setIsBackupDialogOpen] = useState(false);
  const [isInstallDialogOpen, setIsInstallDialogOpen] = useState(false);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [pwaUpdateWorker, setPwaUpdateWorker] =
    useState<ServiceWorker | null>(null);
  const [isPwaStandalone, setIsPwaStandalone] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true,
  );
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [hasLegacyRecovery, setHasLegacyRecovery] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<{
    data: StoredPortfolio;
    fileName: string;
    exportedAt: string | null;
  } | null>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const holdingsRef = useRef<Holding[]>([]);
  const quoteConsentRef = useRef(false);
  const marketRefreshInFlight = useRef(false);
  const lastTransactionUndoRef = useRef<TransactionUndoSnapshot | null>(null);
  const pwaReloadRequestedRef = useRef(false);

  const [holdingSearch, setHoldingSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | Category>("ALL");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [historyEdit, setHistoryEdit] = useState<{ original: Transaction; draft: Transaction; deleting: boolean } | null>(null);
  const [hasHistoryRecovery, setHasHistoryRecovery] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Holding | null>(null);
  const [navUpdateHolding, setNavUpdateHolding] = useState<Holding | null>(null);
  const [navUpdateValue, setNavUpdateValue] = useState("");
  const [lastTransactionUndo, setLastTransactionUndo] =
    useState<TransactionUndoSnapshot | null>(null);

  const [dcaMonthly, setDcaMonthly] = useState(10000);
  const [dcaInitial, setDcaInitial] = useState(50000);
  const [dcaRate, setDcaRate] = useState(7);
  const [dcaYears, setDcaYears] = useState(10);

  const [formSymbol, setFormSymbol] = useState("");
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState<Category>("台股");
  const [formType, setFormType] = useState<TransactionType>("BUY");
  const [formHoldingId, setFormHoldingId] = useState(MANUAL_HOLDING_ID);
  const [formDate, setFormDate] = useState(() => localDateString());
  const [showCustomDate, setShowCustomDate] = useState(false);
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const [formShares, setFormShares] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formAvgPrice, setFormAvgPrice] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formSector, setFormSector] = useState("");
  const [formDivRate, setFormDivRate] = useState("0");
  const [formDivMonths, setFormDivMonths] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formQuoteMode, setFormQuoteMode] = useState<QuoteMode>("AUTO");

  const money = (amountTwd: number) =>
    formatMoney(amountTwd, displayCurrency, usdRate);
  const holdingValueTwd = (holding: Holding) =>
    calculateHoldingValueTwd(holding, usdRate);
  const holdingCostTwd = (holding: Holding) =>
    calculateHoldingCostTwd(holding, usdRate);
  const transactionValueTwd = (transaction: Transaction) =>
    calculateTransactionValueTwd(transaction, usdRate);
  const storedPortfolio = useMemo<StoredPortfolio>(
    () => ({
      schemaVersion: 3,
      holdings,
      transactions,
      marketData: {
        usdTwdRate: usdRate,
        usdTwdUpdatedAt: usdRateUpdatedAt,
        lastSyncAt: lastMarketSyncAt,
        autoRefresh,
        quoteConsent,
      },
      preferences: { currentTheme, displayCurrency, marketStyle },
      calculator: {
        initial: dcaInitial,
        monthly: dcaMonthly,
        annualRate: dcaRate,
        years: dcaYears,
      },
    }),
    [
      currentTheme,
      autoRefresh,
      dcaInitial,
      dcaMonthly,
      dcaRate,
      dcaYears,
      displayCurrency,
      holdings,
      lastMarketSyncAt,
      marketStyle,
      quoteConsent,
      transactions,
      usdRate,
      usdRateUpdatedAt,
    ],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = currentTheme;
    document.documentElement.style.colorScheme = currentTheme === "light" ? "light" : "dark";
    const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.content = currentTheme === "light" ? "#f7f9fc" : "#070b14";
    }
  }, [currentTheme]);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const updateStandaloneState = () => {
      setIsPwaStandalone(
        displayMode.matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone === true,
      );
    };
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setIsPwaStandalone(true);
      setIsInstallDialogOpen(false);
      toast.success("SmartPortfolio 已安裝到裝置");
    };
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleControllerChange = () => {
      if (pwaReloadRequestedRef.current) window.location.reload();
    };

    displayMode.addEventListener("change", updateStandaloneState);
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    let active = true;
    let registration: ServiceWorkerRegistration | null = null;
    let updateTimer: number | null = null;
    let handleUpdateFound: (() => void) | null = null;

    if (
      import.meta.env.PROD &&
      window.location.protocol === "https:" &&
      window.location.hostname !== "sparcgx.github.io" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        handleControllerChange,
      );
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((nextRegistration) => {
          if (!active) return;
          registration = nextRegistration;

          if (
            nextRegistration.waiting &&
            navigator.serviceWorker.controller
          ) {
            setPwaUpdateWorker(nextRegistration.waiting);
          }

          handleUpdateFound = () => {
            const worker = nextRegistration.installing;
            if (!worker) return;
            worker.addEventListener("statechange", () => {
              if (
                worker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                setPwaUpdateWorker(worker);
              }
            });
          };
          nextRegistration.addEventListener(
            "updatefound",
            handleUpdateFound,
          );
          updateTimer = window.setInterval(() => {
            void nextRegistration.update().catch(() => undefined);
          }, 60 * 60 * 1_000);
        })
        .catch(() => undefined);
    }

    return () => {
      active = false;
      displayMode.removeEventListener("change", updateStandaloneState);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          handleControllerChange,
        );
      }
      if (registration && handleUpdateFound) {
        registration.removeEventListener("updatefound", handleUpdateFound);
      }
      if (updateTimer !== null) window.clearInterval(updateTimer);
    };
  }, []);

  useEffect(() => {
    let loadSucceeded = false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setBackupMarker(parseBackupMarker(localStorage.getItem(BACKUP_MARKER_KEY)));
      setLocalNoticeDismissed(localStorage.getItem(LOCAL_NOTICE_KEY) === "dismissed");
      setBackupSnoozeUntil(Number(localStorage.getItem(BACKUP_SNOOZE_KEY)) || 0);
      setHasLegacyRecovery(Boolean(localStorage.getItem(LEGACY_RECOVERY_KEY)));
      setHasRestoreRecovery(Boolean(localStorage.getItem(RESTORE_RECOVERY_KEY)));
      setHasHistoryRecovery(Boolean(localStorage.getItem(HISTORY_RECOVERY_KEY)));
      if (raw) {
        const parsedValue: unknown = JSON.parse(raw);
        const parsed = parsePortfolioBackup(parsedValue);
        let nextData = parsed.data;

        if (readSourceSchemaVersion(parsedValue) === 1) {
          const migration = removeLegacyDemoRows(parsed.data);
          if (migration.removedHoldings > 0 || migration.removedTransactions > 0) {
            if (!localStorage.getItem(LEGACY_RECOVERY_KEY)) {
              try {
                localStorage.setItem(
                  LEGACY_RECOVERY_KEY,
                  JSON.stringify(createPortfolioBackup(parsed.data, "1.0.0")),
                );
                setHasLegacyRecovery(true);
              } catch {
                toast.warning("示範資料已移除，但瀏覽器空間不足，未能保留更新前副本");
              }
            }
            nextData = migration.data;
            toast.info("已移除舊版示範資料，自行建立的紀錄均已保留");
          }
        }

        setHoldings(nextData.holdings);
        setTransactions(nextData.transactions);
        setUsdRate(nextData.marketData.usdTwdRate);
        setUsdRateUpdatedAt(nextData.marketData.usdTwdUpdatedAt);
        setLastMarketSyncAt(nextData.marketData.lastSyncAt);
        setAutoRefresh(nextData.marketData.autoRefresh);
        setQuoteConsent(nextData.marketData.quoteConsent);
        setCurrentTheme(nextData.preferences.currentTheme);
        setDisplayCurrency(nextData.preferences.displayCurrency);
        setMarketStyle(nextData.preferences.marketStyle);
        setDcaInitial(nextData.calculator.initial);
        setDcaMonthly(nextData.calculator.monthly);
        setDcaRate(nextData.calculator.annualRate);
        setDcaYears(nextData.calculator.years);
      }
      loadSucceeded = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知錯誤";
      setStorageError(`本機資料讀取失敗：${message}。原始資料未被覆蓋；請先下載原始資料，再重新載入或匯入備份。`);
    } finally {
      setStorageReady(loadSucceeded);
    }
  }, []);

  useEffect(() => {
    holdingsRef.current = holdings;
  }, [holdings]);

  useEffect(() => {
    quoteConsentRef.current = quoteConsent;
  }, [quoteConsent]);

  useEffect(() => {
    if (!storageReady) return;
    try {
      savePortfolio(localStorage, STORAGE_KEY, storedPortfolio);
      setStorageError(null);
    } catch {
      setStorageError("變更尚未儲存到此裝置。請先匯出備份，避免關閉頁面後遺失；釋出空間或允許儲存後再重試。");
    }
  }, [storageReady, storedPortfolio, saveRetry]);

  useEffect(() => {
    if (!storageError) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [storageError]);

  useEffect(() => {
    const interval = window.setInterval(() => setFreshnessNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const refreshMarketData = useCallback(async (silent = false) => {
    if (marketRefreshInFlight.current) return;
    marketRefreshInFlight.current = true;
    setSyncState("syncing");

    const currentHoldings = quoteConsentRef.current ? holdingsRef.current : [];
    const requested = currentHoldings.filter(
      (holding) =>
        holding.quoteMode === "AUTO" && holding.category !== "公募基金",
    ).length;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 25_000);

    try {
      const snapshot = await fetchMarketSnapshot(
        currentHoldings,
        controller.signal,
      );
      const quoteMap = new Map(
        snapshot.quotes
          .filter(
            (quote) =>
              Number.isFinite(quote.price) && quote.price > 0,
          )
          .map((quote) => [
            marketQuoteKey(quote.category, quote.symbol),
            quote,
          ]),
      );

      if (snapshot.fx && Number.isFinite(snapshot.fx.rate) && snapshot.fx.rate > 0) {
        setUsdRate(snapshot.fx.rate);
        setUsdRateUpdatedAt(snapshot.fx.asOf || snapshot.fetchedAt);
      }

      if (quoteMap.size > 0) {
        lastTransactionUndoRef.current = null;
        setLastTransactionUndo(null);
        setHoldings((previous) =>
          previous.map((holding) => {
            if (holding.quoteMode !== "AUTO" || holding.category === "公募基金") {
              return holding;
            }
            const quote = quoteMap.get(
              marketQuoteKey(holding.category, holding.symbol),
            );
            if (!quote) return holding;
            return {
              ...holding,
              currentPrice: quote.price,
              todayChange: quote.changePercent,
              quoteSource: quote.source,
              priceUpdatedAt: quote.marketTimestampKnown ? quote.asOf : null,
              quoteCheckedAt: snapshot.fetchedAt,
              quoteMarketTime: quote.providerTimestamp,
              quoteMarketTimestampKnown: quote.marketTimestampKnown,
              quoteIsRealtime: quote.isRealtime,
            };
          }),
        );
      }

      const updated = Math.min(requested, quoteMap.size);
      const failed = Math.max(0, requested - updated);
      const errors = snapshot.errors.length + failed;
      const hasUsefulData = Boolean(snapshot.fx) || updated > 0;

      if (hasUsefulData) setLastMarketSyncAt(snapshot.fetchedAt);
      setSyncSummary({ updated, requested, errors });
      setSyncState(!hasUsefulData ? "error" : errors > 0 ? "partial" : "success");

      if (!silent) {
        if (!hasUsefulData) {
          toast.error("更新失敗，已保留原匯率與價格");
        } else if (errors > 0) {
          toast.warning(
            `已更新匯率與 ${updated} 檔行情；${failed} 檔保留原價格`,
          );
        } else if (requested > 0) {
          toast.success(`已更新匯率與 ${updated} 檔最新行情`);
        } else {
          toast.success("USD/TWD 匯率已更新");
        }
      }
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "AbortError"
          ? "連線逾時"
          : error instanceof Error
            ? error.message
            : "未知錯誤";
      setSyncSummary({ updated: 0, requested, errors: Math.max(1, requested) });
      setSyncState("error");
      if (!silent) toast.error(`更新失敗，已保留原資料：${message}`);
    } finally {
      window.clearTimeout(timeout);
      marketRefreshInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!storageReady || !autoRefresh || isStandaloneFile) return;
    void refreshMarketData(true);
    const interval = window.setInterval(
      () => void refreshMarketData(true),
      MARKET_REFRESH_INTERVAL_MS,
    );
    return () => window.clearInterval(interval);
  }, [autoRefresh, isStandaloneFile, refreshMarketData, storageReady]);

  const gainLossText = (value: number) => {
    if (value === 0) return "text-muted-foreground";
    if (marketStyle === "TW") {
      return value > 0 ? "font-bold text-rose-500" : "font-bold text-emerald-500";
    }
    return value > 0 ? "font-bold text-emerald-500" : "font-bold text-rose-500";
  };

  const gainLossBadge = (value: number) => {
    if (value === 0) return "border-border bg-muted text-muted-foreground";
    if (marketStyle === "TW") {
      return value > 0
        ? "border-rose-500/25 bg-rose-500/10 text-rose-500"
        : "border-emerald-500/25 bg-emerald-500/10 text-emerald-500";
    }
    return value > 0
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-500"
      : "border-rose-500/25 bg-rose-500/10 text-rose-500";
  };

  const portfolioSummary = useMemo(() => {
    let totalCost = 0;
    let totalMarketValue = 0;
    let totalTodayChange = 0;
    let totalAnnualDividends = 0;

    holdings.forEach((item) => {
      const itemCost = holdingCostTwd(item);
      const itemValue = holdingValueTwd(item);
      const dailyRate = item.todayChange / 100;
      const previousValue = dailyRate > -1 ? itemValue / (1 + dailyRate) : itemValue;

      totalCost += itemCost;
      totalMarketValue += itemValue;
      totalTodayChange += itemValue - previousValue;
      totalAnnualDividends += itemValue * ((item.divRate || 0) / 100);
    });

    const totalUnrealizedPL = totalMarketValue - totalCost;
    const totalROI = totalCost > 0 ? (totalUnrealizedPL / totalCost) * 100 : 0;
    const previousMarketValue = totalMarketValue - totalTodayChange;
    const todayChangePercent =
      previousMarketValue > 0 ? (totalTodayChange / previousMarketValue) * 100 : 0;
    const dividendYield =
      totalMarketValue > 0 ? (totalAnnualDividends / totalMarketValue) * 100 : 0;

    return {
      totalCost,
      totalMarketValue,
      totalUnrealizedPL,
      totalROI,
      totalTodayChange,
      todayChangePercent,
      totalAnnualDividends,
      dividendYield,
    };
  }, [holdings, usdRate]);

  const priceFreshnessSummary = useMemo(() => {
    const counts = { recent: 0, older: 0, unknown: 0, manual: 0 };
    let unverifiedValue = 0;
    holdings.forEach((holding) => {
      const freshness = holdingFreshness(holding, freshnessNow);
      counts[freshness]++;
      if (freshness !== "recent") unverifiedValue += holdingValueTwd(holding);
    });
    return { ...counts, unverifiedValue };
  }, [holdings, freshnessNow, usdRate]);

  const priceFreshnessLabel = (item: Holding) => FRESHNESS_LABELS[holdingFreshness(item, freshnessNow)];
  const priceFreshnessDetails = (item: Holding) => {
    const time = item.quoteMarketTime || (item.quoteMarketTimestampKnown && item.priceUpdatedAt
      ? formatBackupDate(item.priceUpdatedAt) : "未提供");
    const checked = item.quoteCheckedAt ? formatBackupDate(item.quoteCheckedAt) : "未記錄";
    if (item.quoteMode === "MANUAL" || item.category === "公募基金") {
      return `${item.quoteSource} · 手動更新 ${formatBackupDate(item.priceUpdatedAt)}`;
    }
    return `${item.quoteSource} · 來源成交／收盤時間 ${time} · 查詢時間 ${checked}`;
  };

  const categoryAllocation = useMemo(() => {
    const values: Record<Category, number> = { 台股: 0, 美股: 0, 公募基金: 0 };
    holdings.forEach((item) => {
      values[item.category] += holdingValueTwd(item);
    });
    return CATEGORIES.map((category) => ({
      name: category,
      value: values[category],
      color: CATEGORY_COLORS[category],
    }));
  }, [holdings, usdRate]);

  const allocationGradient = useMemo(() => {
    if (portfolioSummary.totalMarketValue <= 0) return "var(--muted) 0 100%";
    let cursor = 0;
    return categoryAllocation
      .map((category) => {
        const start = cursor;
        cursor += (category.value / portfolioSummary.totalMarketValue) * 100;
        return `${category.color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
      })
      .join(", ");
  }, [categoryAllocation, portfolioSummary.totalMarketValue]);

  const filteredHoldings = useMemo(() => {
    const search = holdingSearch.trim().toLocaleLowerCase("zh-Hant");
    return holdings.filter((item) => {
      const matchesSearch =
        !search ||
        item.name.toLocaleLowerCase("zh-Hant").includes(search) ||
        item.symbol.toLocaleLowerCase("zh-Hant").includes(search);
      const matchesCategory = categoryFilter === "ALL" || item.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [categoryFilter, holdingSearch, holdings]);

  const sortedTransactions = useMemo(
    () => transactions.slice().sort((a, b) => b.date.localeCompare(a.date)),
    [transactions],
  );
  const backupStatus = useMemo(
    () => backupReminder(backupMarker, holdings, transactions),
    [backupMarker, holdings, transactions],
  );

  const selectedFormHolding = useMemo(
    () => holdings.find((holding) => holding.id === formHoldingId) ?? null,
    [formHoldingId, holdings],
  );
  const transactionHoldingOptions = useMemo(
    () =>
      formType === "SELL"
        ? holdings.filter((holding) => holding.shares > 0 || transactions.some(
            (transaction) => transaction.type === "BUY" && transaction.symbol.toUpperCase() === holding.symbol.toUpperCase() && transaction.category === holding.category,
          ))
        : holdings,
    [formType, holdings, transactions],
  );
  const recentFormHoldings = useMemo(() => {
    const availableByKey = new Map(
      transactionHoldingOptions.map((holding) => [
        `${holding.category}:${holding.symbol.trim().toUpperCase()}`,
        holding,
      ]),
    );
    const seen = new Set<string>();
    const recent: Holding[] = [];
    for (const transaction of transactions) {
      const key = `${transaction.category}:${transaction.symbol.trim().toUpperCase()}`;
      const holding = availableByKey.get(key);
      if (!holding || seen.has(holding.id)) continue;
      seen.add(holding.id);
      recent.push(holding);
      if (recent.length === 3) break;
    }
    return recent;
  }, [transactionHoldingOptions, transactions]);
  const todayDate = localDateString();
  const yesterdayDate = (() => {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return localDateString(date);
  })();
  const isManualTransaction =
    !editingHolding && formHoldingId === MANUAL_HOLDING_ID;
  const hasTransactionTarget = Boolean(
    isManualTransaction || selectedFormHolding,
  );

  const transactionPreview = useMemo(() => {
    if (editingHolding || !isValidHistoricalDate(formDate)) return null;
    const symbol = formSymbol.trim().toUpperCase();
    const name = formName.trim();
    if (!symbol || !name) return null;

    if (formType === "DIVIDEND") {
      const amount = Number(formAmount);
      if (!Number.isFinite(amount) || amount <= 0) return null;
      return {
        label: "股息",
        name,
        symbol,
        date: formDate,
        gross: amount,
        fee: 0,
        tax: 0,
        remainingShares: null as number | null,
        error: null as string | null,
      };
    }

    const shares = Number(formShares);
    const price = Number(formPrice);
    if (
      !Number.isFinite(shares) ||
      shares <= 0 ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      return null;
    }
    const { fee, tax } = estimateTransactionCosts(
      formCategory,
      formType,
      shares,
      price,
      selectedFormHolding?.sector ?? formSector,
    );
    const existing = holdings.find((item) => item.symbol.toUpperCase() === symbol) ?? null;
    const assessment = assessTrade(
      existing,
      transactions.filter((row) => row.symbol.toUpperCase() === symbol && row.category === (existing?.category ?? formCategory)),
      { id: "preview", symbol, name, category: existing?.category ?? formCategory, type: formType, date: formDate, shares, price },
      localDateString(),
    );
    return {
      label: formType === "BUY" ? "買入" : "賣出",
      name,
      symbol,
      date: formDate,
      gross: shares * price,
      fee,
      tax,
      remainingShares: formType === "SELL" && assessment.position ? assessment.position.shares : null,
      error: assessment.error ?? null,
    };
  }, [
    editingHolding,
    formAmount,
    formCategory,
    formDate,
    formName,
    formPrice,
    formSector,
    formShares,
    formSymbol,
    formType,
    selectedFormHolding,
    holdings,
    transactions,
  ]);

  const topHoldings = useMemo(
    () =>
      holdings
        .slice()
        .sort((a, b) => holdingValueTwd(b) - holdingValueTwd(a))
        .slice(0, 3),
    [holdings, usdRate],
  );

  const dividendByMonth = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      amount: 0,
    }));
    holdings.forEach((holding) => {
      const scheduledMonths = normalizeDividendMonths(holding.estDivMonth);
      if (scheduledMonths.length === 0) return;
      const annualDividend = holdingValueTwd(holding) * (holding.divRate / 100);
      const eachPayment = annualDividend / scheduledMonths.length;
      scheduledMonths.forEach((month) => {
        months[month - 1].amount += eachPayment;
      });
    });
    return months;
  }, [holdings, usdRate]);

  const sectorAllocation = useMemo(() => {
    const sectors = new Map<string, number>();
    holdings.forEach((holding) => {
      sectors.set(
        holding.sector || "未分類",
        (sectors.get(holding.sector || "未分類") ?? 0) + holdingValueTwd(holding),
      );
    });
    return Array.from(sectors, ([name, value]) => ({ name, value })).sort(
      (a, b) => b.value - a.value,
    );
  }, [holdings, usdRate]);

  const dcaResult = useMemo(() => {
    const months = Math.max(0, dcaYears * 12);
    const monthlyRate = dcaRate / 100 / 12;
    const initialGrowth = dcaInitial * Math.pow(1 + monthlyRate, months);
    const contributionGrowth =
      monthlyRate === 0
        ? dcaMonthly * months
        : dcaMonthly * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
    const futureValue = initialGrowth + contributionGrowth;
    const totalCost = dcaInitial + dcaMonthly * months;
    return {
      futureValue,
      totalCost,
      totalProfit: futureValue - totalCost,
    };
  }, [dcaInitial, dcaMonthly, dcaRate, dcaYears]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    const register = async () => {
      await context.registerTool(
        {
          name: "read_portfolio_summary",
          title: "讀取投資組合摘要",
          description: "讀取畫面目前顯示的資產淨值、成本、損益與預估年股息。",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute: () => ({
            currency: "TWD",
            totalMarketValue: Math.round(portfolioSummary.totalMarketValue),
            totalCost: Math.round(portfolioSummary.totalCost),
            unrealizedProfitLoss: Math.round(portfolioSummary.totalUnrealizedPL),
            roiPercent: Number(portfolioSummary.totalROI.toFixed(2)),
            estimatedAnnualDividends: Math.round(
              portfolioSummary.totalAnnualDividends,
            ),
          }),
        },
        { signal: lifecycle.signal },
      );

      await context.registerTool(
        {
          name: "start_portfolio_transaction",
          title: "開啟交易登記",
          description: "開啟交易表單並預先填入買入、賣出或股息的基本資料；不會直接儲存。",
          inputSchema: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["BUY", "SELL", "DIVIDEND"] },
              symbol: { type: "string" },
              name: { type: "string" },
              category: { type: "string", enum: CATEGORIES },
            },
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute: (rawInput) => {
            if (!rawInput || typeof rawInput !== "object") {
              throw new Error("輸入必須是物件");
            }
            const input = rawInput as Partial<{
              type: TransactionType;
              symbol: string;
              name: string;
              category: Category;
            }>;
            if (input.type && !["BUY", "SELL", "DIVIDEND"].includes(input.type)) {
              throw new Error("不支援的交易類型");
            }
            if (input.category && !CATEGORIES.includes(input.category)) {
              throw new Error("不支援的標的類別");
            }
            setEditingHolding(null);
            setFormType(input.type ?? "BUY");
            setFormHoldingId(MANUAL_HOLDING_ID);
            setFormDate(localDateString());
            setShowCustomDate(false);
            setShowAdvancedFields(false);
            setFormSymbol(input.symbol ?? "");
            setFormName(input.name ?? "");
            setFormCategory(input.category ?? "台股");
            setFormShares("");
            setFormPrice("");
            setFormAvgPrice("");
            setFormAmount("");
            setFormSector("");
            setFormDivRate("0");
            setFormDivMonths("");
            setFormNote("");
            setFormQuoteMode(input.category === "公募基金" ? "MANUAL" : "AUTO");
            setIsAddModalOpen(true);
            return { status: "form_opened", saved: false };
          },
        },
        { signal: lifecycle.signal },
      );
    };

    void register().catch(() => undefined);
    return () => lifecycle.abort();
  }, [portfolioSummary]);

  const resetForm = () => {
    setEditingHolding(null);
    setFormSymbol("");
    setFormName("");
    setFormCategory("台股");
    setFormType("BUY");
    setFormHoldingId(MANUAL_HOLDING_ID);
    setFormDate(localDateString());
    setShowCustomDate(false);
    setShowAdvancedFields(false);
    setFormShares("");
    setFormPrice("");
    setFormAvgPrice("");
    setFormAmount("");
    setFormSector("");
    setFormDivRate("0");
    setFormDivMonths("");
    setFormNote("");
    setFormQuoteMode("AUTO");
  };

  const handleOpenAddModal = (item: Holding | null = null) => {
    if (item) {
      setEditingHolding(item);
      setFormHoldingId(item.id);
      setFormSymbol(item.symbol);
      setFormName(item.name);
      setFormCategory(item.category);
      setFormShares(String(item.shares));
      setFormPrice(String(item.currentPrice));
      setFormAvgPrice(String(item.avgPrice));
      setFormSector(item.sector || "未分類");
      setFormDivRate(String(item.divRate || 0));
      setFormDivMonths(item.estDivMonth || "");
      setFormAmount("");
      setFormNote("");
      setFormQuoteMode(item.quoteMode);
    } else {
      resetForm();
    }
    setIsAddModalOpen(true);
  };

  const applyHoldingToTransactionForm = (item: Holding) => {
    setFormHoldingId(item.id);
    setFormSymbol(item.symbol);
    setFormName(item.name);
    setFormCategory(item.category);
    setFormShares("");
    setFormPrice(formType === "DIVIDEND" ? "" : String(item.currentPrice));
    setFormAmount("");
    setFormSector(item.sector || "未分類");
    setFormDivRate(String(item.divRate || 0));
    setFormDivMonths(item.estDivMonth || "");
    setFormQuoteMode(item.quoteMode);
  };

  const handleFormHoldingChange = (holdingId: string) => {
    if (holdingId === MANUAL_HOLDING_ID) {
      setFormHoldingId(MANUAL_HOLDING_ID);
      setFormSymbol("");
      setFormName("");
      setFormCategory("台股");
      setFormShares("");
      setFormPrice("");
      setFormAmount("");
      setFormSector("");
      setFormDivRate("0");
      setFormDivMonths("");
      setFormQuoteMode("AUTO");
      return;
    }
    const holding = holdings.find((item) => item.id === holdingId);
    if (holding) applyHoldingToTransactionForm(holding);
  };

  const handleTransactionTypeChange = (type: TransactionType) => {
    setFormType(type);
    setFormShares("");
    setFormAmount("");
    if (type === "DIVIDEND") setFormPrice("");

    const currentHolding = holdings.find((item) => item.id === formHoldingId);
    if (type === "SELL" && (!currentHolding || currentHolding.shares <= 0)) {
      setFormHoldingId("");
      setFormSymbol("");
      setFormName("");
      setFormPrice("");
    } else if (type === "DIVIDEND" && !currentHolding) {
      setFormHoldingId("");
      setFormSymbol("");
      setFormName("");
    } else if (type === "BUY" && !currentHolding) {
      setFormHoldingId(MANUAL_HOLDING_ID);
    } else if (currentHolding && type !== "DIVIDEND") {
      setFormPrice(String(currentHolding.currentPrice));
    }
  };

  const handleOpenQuickTransaction = (
    type: TransactionType,
    item: Holding,
  ) => {
    resetForm();
    setFormType(type);
    setFormHoldingId(item.id);
    setFormSymbol(item.symbol);
    setFormName(item.name);
    setFormCategory(item.category);
    setFormPrice(type === "DIVIDEND" ? "" : String(item.currentPrice));
    setFormSector(item.sector || "未分類");
    setFormDivRate(String(item.divRate || 0));
    setFormDivMonths(item.estDivMonth || "");
    setFormQuoteMode(item.quoteMode);
    setIsAddModalOpen(true);
  };

  const rememberTransactionUndo = (snapshot: TransactionUndoSnapshot) => {
    lastTransactionUndoRef.current = snapshot;
    setLastTransactionUndo(snapshot);
  };

  const clearTransactionUndo = () => {
    lastTransactionUndoRef.current = null;
    setLastTransactionUndo(null);
  };

  const undoTransaction = (snapshot: TransactionUndoSnapshot) => {
    if (lastTransactionUndoRef.current?.transactionId !== snapshot.transactionId) {
      toast.info("目前只能復原最近一筆交易");
      return;
    }

    setTransactions((previous) =>
      previous.filter((transaction) => transaction.id !== snapshot.transactionId),
    );
    if (snapshot.holdingId) {
      setHoldings((previous) => {
        if (!snapshot.previousHolding) {
          return previous.filter((holding) => holding.id !== snapshot.holdingId);
        }
        const hasHolding = previous.some(
          (holding) => holding.id === snapshot.holdingId,
        );
        return hasHolding
          ? previous.map((holding) =>
              holding.id === snapshot.holdingId
                ? { ...holding, shares: snapshot.previousHolding!.shares, avgPrice: snapshot.previousHolding!.avgPrice }
                : holding,
            )
          : [...previous, snapshot.previousHolding];
      });
    }
    clearTransactionUndo();
    toast.info(`已復原${snapshot.transactionLabel}`);
  };

  const handleOpenNavUpdate = (item: Holding) => {
    setNavUpdateHolding(item);
    setNavUpdateValue(String(item.currentPrice));
  };

  const handleSaveNavUpdate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!navUpdateHolding) return;
    const value = Number(navUpdateValue);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("基金淨值必須大於 0");
      return;
    }
    clearTransactionUndo();
    setHoldings((previous) =>
      previous.map((holding) =>
        holding.id === navUpdateHolding.id
          ? {
              ...holding,
              currentPrice: value,
              quoteSource: "手動基金淨值",
              priceUpdatedAt: new Date().toISOString(),
              quoteCheckedAt: null,
              quoteMarketTime: null,
              quoteMarketTimestampKnown: false,
              quoteIsRealtime: false,
            }
          : holding,
      ),
    );
    setNavUpdateHolding(null);
    toast.success(`已更新「${navUpdateHolding.name}」基金淨值`);
  };

  const handleSaveTransaction = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const symbol = formSymbol.trim().toUpperCase();
    const name = formName.trim();
    const shares = Number(formShares);
    const price = Number(formPrice);
    const avgPrice = Number(formAvgPrice);
    const amount = Number(formAmount);
    const divRate = Number(formDivRate) || 0;
    const dividendMonths = normalizeDividendMonths(formDivMonths);

    if (!editingHolding && !isValidHistoricalDate(formDate)) {
      toast.error("請選擇有效且不晚於今天的交易日期");
      return;
    }

    if (!symbol || !name) {
      toast.error("請填寫標的代號與名稱");
      return;
    }

    if (formType === "SELL" && !editingHolding && !selectedFormHolding) {
      toast.error("請先選擇要賣出的既有持股");
      return;
    }

    if (divRate < 0) {
      toast.error("殖利率不可小於 0");
      return;
    }

    if (editingHolding) {
      if (!Number.isFinite(shares) || shares < 0 || !Number.isFinite(price) || !Number.isFinite(avgPrice) || price <= 0 || avgPrice <= 0) {
        toast.error("持有數量、平均成本與現價必須是有效數值");
        return;
      }
      clearTransactionUndo();
      setHoldings((previous) =>
        previous.map((holding) =>
          holding.id === editingHolding.id
            ? {
                ...holding,
                symbol,
                name,
                category: formCategory,
                shares,
                avgPrice,
                currentPrice: price,
                sector: formSector.trim() || "未分類",
                divRate,
                estDivMonth: dividendMonths.join(","),
                quoteMode:
                  formCategory === "公募基金" ? "MANUAL" : formQuoteMode,
                quoteSource:
                  formCategory === "公募基金"
                    ? "手動基金淨值"
                    : formQuoteMode === "MANUAL"
                      ? "手動價格"
                      : "手動修改（待行情更新）",
                priceUpdatedAt:
                  formQuoteMode === "MANUAL" || formCategory === "公募基金"
                    ? new Date().toISOString()
                    : null,
                quoteCheckedAt: null,
                quoteMarketTime: null,
                quoteMarketTimestampKnown: false,
                quoteIsRealtime: false,
              }
            : holding,
        ),
      );
      setIsAddModalOpen(false);
      toast.success(`已更新「${name}」持股資訊`);
      return;
    }

    if (formType === "DIVIDEND") {
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error("股息金額必須大於 0");
        return;
      }
      const existing = holdings.find(
        (holding) => holding.symbol.toLowerCase() === symbol.toLowerCase(),
      );
      const transaction: Transaction = {
        id: createId("tx"),
        symbol,
        name,
        category: existing?.category ?? formCategory,
        type: "DIVIDEND",
        date: formDate,
        amount,
        note: formNote.trim() || "手動登記現金股利",
      };
      const undoSnapshot: TransactionUndoSnapshot = {
        transactionId: transaction.id,
        transactionLabel: `「${name}」股息登記`,
        holdingId: null,
        previousHolding: null,
      };
      rememberTransactionUndo(undoSnapshot);
      setTransactions((previous) => [transaction, ...previous]);
      setIsAddModalOpen(false);
      toast.success(`已登記「${name}」股息收入`, {
        action: {
          label: "復原",
          onClick: () => undoTransaction(undoSnapshot),
        },
      });
      return;
    }

    if (!Number.isFinite(shares) || shares <= 0 || !Number.isFinite(price) || price <= 0) {
      toast.error("交易數量與成交價格必須大於 0");
      return;
    }

    const existing = holdings.find(
      (holding) => holding.symbol.toLowerCase() === symbol.toLowerCase(),
    );

    if (formType === "SELL" && !existing) {
      toast.error("找不到可賣出的既有持股");
      return;
    }
    const actualCategory = existing?.category ?? formCategory;
    const actualName = existing?.name ?? name;
    const { fee: estimatedFee, tax: estimatedTax } =
      estimateTransactionCosts(
        actualCategory,
        formType,
        shares,
        price,
        existing?.sector ?? formSector,
      );

    const transaction: Transaction = {
      id: createId("tx"),
      symbol,
      name: actualName,
      category: actualCategory,
      type: formType,
      date: formDate,
      shares,
      price,
      fee: estimatedFee,
      tax: estimatedTax,
      note: formNote.trim() || "手動新增交易紀錄",
    };
    const assessment = assessTrade(
      existing ?? null,
      transactions.filter((row) => row.symbol.toUpperCase() === symbol && row.category === actualCategory),
      transaction,
      localDateString(),
    );
    if (assessment.position === null) {
      toast.error(assessment.error);
      return;
    }
    const affectedHoldingId = existing?.id ?? createId("holding");
    const nextHoldings: Holding[] = existing
      ? holdings.map((holding) => holding.id === existing.id
          ? { ...holding, shares: assessment.position.shares, avgPrice: Math.round(assessment.position.avgPrice * 10000) / 10000 }
          : holding)
      : [...holdings, {
          id: affectedHoldingId, symbol, name, category: formCategory,
          shares: assessment.position.shares,
          avgPrice: Math.round(assessment.position.avgPrice * 10000) / 10000,
          currentPrice: price,
          sector: formSector.trim() || "未分類", divRate,
          estDivMonth: dividendMonths.join(","), todayChange: 0,
          quoteMode: formCategory === "公募基金" ? "MANUAL" : formQuoteMode,
          quoteSource: formDate === localDateString() ? "最近交易成交價" : "歷史成交價（請更新現價）",
          priceUpdatedAt: formDate === localDateString() ? new Date().toISOString() : null,
          quoteCheckedAt: null, quoteMarketTime: null,
          quoteMarketTimestampKnown: false, quoteIsRealtime: false,
        }];
    const transactionLabel = `「${actualName}」${formType === "BUY" ? "買入" : "賣出"}交易`;
    const undoSnapshot: TransactionUndoSnapshot = {
      transactionId: transaction.id,
      transactionLabel,
      holdingId: affectedHoldingId,
      previousHolding: existing ?? null,
    };
    setHoldings(nextHoldings);
    rememberTransactionUndo(undoSnapshot);
    setTransactions((previous) => [transaction, ...previous]);
    setIsAddModalOpen(false);
    toast.success(`已登記${transactionLabel}`, {
      action: {
        label: "復原",
        onClick: () => undoTransaction(undoSnapshot),
      },
    });
  };

  const confirmDeleteHolding = () => {
    if (!pendingDelete) return;
    clearTransactionUndo();
    setHoldings((previous) =>
      previous.filter((holding) => holding.id !== pendingDelete.id),
    );
    toast.info(`已移除「${pendingDelete.name}」持股；交易履歷仍保留`);
    setPendingDelete(null);
  };

  const performance = useMemo(() => investmentPerformance(holdings, transactions, usdRate), [holdings, transactions, usdRate]);
  const [performanceYear, setPerformanceYear] = useState("ALL");
  const performanceYears = [...new Set(transactions.map(row => row.date.slice(0,4)))].sort().reverse();

  const reconciliationIssues = holdings.flatMap(holding => {
    const history = transactions.filter(row => row.category === holding.category && row.symbol.toUpperCase() === holding.symbol.toUpperCase());
    if (!history.some(row => row.type !== "DIVIDEND")) return [];
    const position = replayPosition(history);
    if (samePosition(position, holding)) return [];
    return [{holding, position}];
  });

  const historyImpact = historyEdit ? assessHistoryChange(holdings, transactions,
    historyEdit.original.id, historyEdit.deleting ? null : historyEdit.draft, localDateString()) : null;

  const confirmHistoryChange = () => {
    if (!historyEdit || !storageReady) return;
    const impact = assessHistoryChange(holdings, transactions, historyEdit.original.id,
      historyEdit.deleting ? null : historyEdit.draft, localDateString());
    if (impact.error) { toast.error(impact.error); return; }
    const next = { ...storedPortfolio, holdings: impact.holdings, transactions: impact.transactions };
    try {
      localStorage.setItem(HISTORY_RECOVERY_KEY, JSON.stringify(createPortfolioBackup(storedPortfolio, APP_VERSION)));
      setHasHistoryRecovery(true);
      savePortfolio(localStorage, STORAGE_KEY, next);
    } catch {
      toast.error("無法保存操作前快照或變更資料，本次未套用；請先匯出備份並檢查儲存空間");
      return;
    }
    clearTransactionUndo();
    setHoldings(impact.holdings); setTransactions(impact.transactions); setStorageError(null);
    setHistoryEdit(null);
    toast.success("交易與持股已同步儲存；操作前快照可在備份中下載");
  };

  const handleExportBackup = () => {
    try {
      const backup = createPortfolioBackup(storedPortfolio, APP_VERSION);
      downloadJsonFile(backup, `SmartPortfolio_完整備份_${backupFileStamp()}.json`);
      const marker: BackupMarker = {
        exportedAt: backup.exportedAt,
        signature: recordSignature(holdings, transactions),
        transactionIds: transactions.map(({ id }) => id),
      };
      try {
        localStorage.setItem(BACKUP_MARKER_KEY, JSON.stringify(marker));
        localStorage.removeItem(BACKUP_SNOOZE_KEY);
        setBackupMarker(marker);
        setBackupSnoozeUntil(0);
      } catch {
        toast.warning("已啟動備份下載，但瀏覽器無法記錄備份時間");
      }
      toast.success(`已產生備份下載：${holdings.length} 筆持股、${transactions.length} 筆交易；請確認檔案已保存`);
    } catch {
      toast.error("無法產生備份檔，請檢查瀏覽器的下載設定");
    }
  };

  const handleImportBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("備份檔超過 10 MB，請確認是否選到正確檔案");
      return;
    }

    try {
      const parsed = parsePortfolioBackup(JSON.parse(await file.text()));
      setPendingRestore({
        data: parsed.data,
        fileName: file.name,
        exportedAt: parsed.exportedAt,
      });
      setIsBackupDialogOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "無法辨識備份檔";
      toast.error(`無法匯入：${message}`);
    }
  };

  const confirmRestore = () => {
    if (!pendingRestore) return;
    try {
      restoreWithSnapshot(localStorage, STORAGE_KEY, storedPortfolio, pendingRestore.data, APP_VERSION, storageReady);
      setHasRestoreRecovery(Boolean(localStorage.getItem(RESTORE_RECOVERY_KEY)));
    } catch {
      toast.error("無法保存復原快照或還原資料，已停止還原。請先匯出備份並檢查儲存空間與權限");
      return;
    }

    setStorageReady(true);
    setStorageError(null);
    const restored = pendingRestore.data;
    try {
      localStorage.removeItem(BACKUP_MARKER_KEY);
      localStorage.removeItem(BACKUP_SNOOZE_KEY);
    } catch {
      // The portfolio itself has already been saved; the reminder stays visible.
    }
    setBackupMarker(null);
    setBackupSnoozeUntil(0);
    clearTransactionUndo();
    setHoldings(restored.holdings);
    setTransactions(restored.transactions);
    setUsdRate(restored.marketData.usdTwdRate);
    setUsdRateUpdatedAt(restored.marketData.usdTwdUpdatedAt);
    setLastMarketSyncAt(restored.marketData.lastSyncAt);
    setAutoRefresh(restored.marketData.autoRefresh);
    setQuoteConsent(restored.marketData.quoteConsent);
    setCurrentTheme(restored.preferences.currentTheme);
    setDisplayCurrency(restored.preferences.displayCurrency);
    setMarketStyle(restored.preferences.marketStyle);
    setDcaInitial(restored.calculator.initial);
    setDcaMonthly(restored.calculator.monthly);
    setDcaRate(restored.calculator.annualRate);
    setDcaYears(restored.calculator.years);
    setHoldingSearch("");
    setCategoryFilter("ALL");
    setActiveTab("dashboard");
    toast.success(
      `還原完成：${restored.holdings.length} 筆持股、${restored.transactions.length} 筆交易`,
    );
    setPendingRestore(null);
  };

  const downloadStoredRaw = (key: string, label: string) => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) throw new Error("找不到資料");
      const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = `SmartPortfolio_${label}_${backupFileStamp()}.json`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.info("已產生下載，請確認檔案已保存");
    } catch { toast.error("無法讀取或下載此裝置資料"); }
  };

  const handleDownloadLegacyRecovery = () => {
    try {
      const raw = localStorage.getItem(LEGACY_RECOVERY_KEY);
      if (!raw) {
        setHasLegacyRecovery(false);
        toast.error("找不到更新前資料");
        return;
      }
      downloadJsonFile(
        JSON.parse(raw),
        `SmartPortfolio_更新前資料_${backupFileStamp()}.json`,
      );
      toast.success("更新前資料已下載");
    } catch {
      toast.error("更新前資料損毀，無法下載");
    }
  };

  const handleMarketRefreshRequest = () => {
    if (isStandaloneFile) {
      toast.info("即時行情連動請使用已發布的 SmartPortfolio 工作站網站");
      return;
    }
    const hasAutomaticQuotes = holdingsRef.current.some(
      (holding) =>
        holding.quoteMode === "AUTO" && holding.category !== "公募基金",
    );
    if (hasAutomaticQuotes && !quoteConsentRef.current) {
      setIsMarketConsentOpen(true);
      return;
    }
    void refreshMarketData(false);
  };

  const confirmMarketConsent = () => {
    quoteConsentRef.current = true;
    setQuoteConsent(true);
    setIsMarketConsentOpen(false);
    void refreshMarketData(false);
  };

  const disableMarketConsent = () => {
    quoteConsentRef.current = false;
    setQuoteConsent(false);
    setSyncSummary({ updated: 0, requested: 0, errors: 0 });
    toast.info("已停止傳送個股代號；匯率仍可自動更新");
  };

  const automaticHoldingCount = holdings.filter(
    (holding) =>
      holding.quoteMode === "AUTO" && holding.category !== "公募基金",
  ).length;
  const manualNavCount = holdings.filter(
    (holding) => holding.category === "公募基金",
  ).length;
  const syncStatusLabel =
    isStandaloneFile
      ? "離線手動模式"
      : syncState === "syncing"
      ? "更新中"
      : syncState === "error"
        ? "連線異常"
        : syncState === "partial"
          ? "部分更新"
          : lastMarketSyncAt
            ? "資料已同步"
            : "等待首次同步";
  const syncStatusClass =
    isStandaloneFile
      ? "bg-muted-foreground"
      : syncState === "error"
      ? "bg-rose-500"
      : syncState === "partial"
        ? "bg-amber-500"
        : syncState === "syncing"
          ? "bg-cyan-500 animate-pulse"
          : lastMarketSyncAt
            ? "bg-emerald-500"
            : "bg-muted-foreground";

  const renderHoldingTransactionMenu = (
    item: Holding,
    compact = false,
  ) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={compact ? "icon-sm" : "sm"}
          aria-label={`${item.name} 快速操作`}
        >
          <WalletCards />
          {!compact && "操作"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{item.name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => handleOpenQuickTransaction("BUY", item)}>
          <Plus /> 加碼買入
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={item.shares <= 0}
          onSelect={() => handleOpenQuickTransaction("SELL", item)}
        >
          <TrendingDown /> 賣出
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => handleOpenQuickTransaction("DIVIDEND", item)}>
          <Coins /> 登記股息
        </DropdownMenuItem>
        {item.category === "公募基金" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => handleOpenNavUpdate(item)}>
              <Activity /> 更新基金淨值
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const handlePrimaryNavChange = (tabId: TabId) => {
    setActiveTab(tabId);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const handlePwaInstall = async () => {
    setIsInstallDialogOpen(true);
  };

  const promptNativeInstall = async () => {
    if (!installPrompt) {
      return;
    }

    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
    } catch {
      toast.error("請從瀏覽器選單安裝，或依畫面說明加入主畫面");
    }
  };

  const snoozeBackupReminder = () => {
    const until = Date.now() + 24 * 60 * 60 * 1_000;
    setBackupSnoozeUntil(until);
    try { localStorage.setItem(BACKUP_SNOOZE_KEY, String(until)); } catch { /* session only */ }
  };

  const dismissLocalNotice = () => {
    setLocalNoticeDismissed(true);
    try { localStorage.setItem(LOCAL_NOTICE_KEY, "dismissed"); } catch { /* session only */ }
  };

  const handleApplyPwaUpdate = () => {
    if (!pwaUpdateWorker) return;
    pwaReloadRequestedRef.current = true;
    pwaUpdateWorker.postMessage({ type: "SKIP_WAITING" });
    toast.info("正在套用新版，完成後會自動重新開啟");
  };

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-background text-foreground antialiased selection:bg-primary selection:text-primary-foreground">
      <Toaster richColors position="top-right" closeButton />
      <div className="min-h-screen">
        <header className="sticky top-0 z-40 border-b border-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
          <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
            <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 py-3 lg:flex-nowrap">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 shadow-lg shadow-indigo-500/20">
                  <BriefcaseBusiness className="size-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-bold tracking-tight sm:text-lg">
                    智投資 <span className="text-primary">SmartPortfolio</span>
                  </p>
                  <p className="hidden text-xs text-muted-foreground md:block">
                    持股資料本機保存 · v{APP_VERSION} · 行情與匯率連動
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsBackupDialogOpen(true)}
                >
                  <DatabaseBackup className={backupStatus.needsAttention ? "text-amber-600" : "text-primary"} />
                  <span className="hidden sm:inline">資料備份</span>
                  <span className="sm:hidden">備份</span>
                </Button>

                {!isStandaloneFile && !isGithubPages && !isPwaStandalone && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handlePwaInstall()}
                    aria-label="安裝 SmartPortfolio App"
                    title="安裝 SmartPortfolio App"
                  >
                    <Download className="text-primary" />
                    <span className="hidden sm:inline">安裝 App</span>
                  </Button>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" aria-label="切換介面風格">
                      <Palette className="text-primary" />
                      <span className="hidden sm:inline">{THEMES[currentTheme].name}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    <DropdownMenuLabel>介面風格</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuRadioGroup
                      value={currentTheme}
                      onValueChange={(value) => {
                        const nextTheme = value as ThemeId;
                        setCurrentTheme(nextTheme);
                        toast.info(`已切換至「${THEMES[nextTheme].name}」`);
                      }}
                    >
                      {Object.values(THEMES).map((theme) => (
                        <DropdownMenuRadioItem
                          key={theme.id}
                          value={theme.id}
                          className="items-start py-2.5"
                        >
                          <span className={`mt-1 size-3 rounded-full ${theme.swatch}`} />
                          <span>
                            <span className="block font-semibold">{theme.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {theme.subtitle}
                            </span>
                          </span>
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>

                <div className="flex rounded-lg border border-border bg-card p-1">
                  <Button
                    type="button"
                    size="xs"
                    variant={displayCurrency === "TWD" ? "default" : "ghost"}
                    onClick={() => setDisplayCurrency("TWD")}
                    aria-pressed={displayCurrency === "TWD"}
                  >
                    NT$
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant={displayCurrency === "USD" ? "default" : "ghost"}
                    onClick={() => setDisplayCurrency("USD")}
                    aria-pressed={displayCurrency === "USD"}
                  >
                    USD
                  </Button>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMarketStyle(marketStyle === "TW" ? "US" : "TW")}
                  title="切換台股或歐美市場的漲跌顏色"
                >
                  <Globe2 className="text-primary" />
                  <span className="hidden sm:inline">
                    {marketStyle === "TW" ? "紅漲綠跌" : "綠漲紅跌"}
                  </span>
                </Button>

                <Button
                  type="button"
                  size="sm"
                  className="hidden sm:inline-flex"
                  onClick={() => handleOpenAddModal()}
                >
                  <Plus />
                  登記交易
                </Button>
              </div>
            </div>

            <nav className="border-t border-border/70 py-2" aria-label="主要功能">
              <div className="grid grid-cols-5 gap-1 sm:flex sm:items-center sm:justify-start">
                {NAV_TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      type="button"
                      key={tab.id}
                      id={`tab-${tab.id}`}
                      aria-current={isActive ? "page" : undefined}
                      aria-controls={`panel-${tab.id}`}
                      onClick={() => handlePrimaryNavChange(tab.id)}
                      className={`flex h-11 min-w-0 items-center justify-center gap-1 rounded-xl px-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:h-10 sm:flex-none sm:gap-1.5 sm:px-3.5 sm:text-sm ${
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="sm:hidden">{tab.compactLabel}</span>
                      <span className="hidden sm:inline">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </nav>
          </div>
        </header>

        {pwaUpdateWorker && (
          <div className="border-b border-primary/25 bg-primary text-primary-foreground">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-6 lg:px-8">
              <div>
                <p className="text-sm font-bold">SmartPortfolio 有新版本</p>
                <p className="text-xs text-primary-foreground/80">
                  套用後會自動重新開啟，持股與交易資料不受影響。
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={handleApplyPwaUpdate}
              >
                <RefreshCw /> 立即更新
              </Button>
            </div>
          </div>
        )}

        {!isOnline && (
          <div
            role="status"
            className="border-b border-amber-500/25 bg-amber-500/10 px-3 py-2 text-center text-sm font-medium text-amber-600 dark:text-amber-400"
          >
            目前為離線模式；可查看本機資料，行情與匯率將在連線後更新。
          </div>
        )}

        {storageError && (
          <div role="alert" className="mb-4 space-y-3 rounded-xl border border-destructive bg-destructive/10 p-4 text-sm">
            <p className="font-bold">資料儲存需要處理</p><p>{storageError}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleExportBackup}>匯出目前畫面資料</Button>
              {storageReady ? <Button onClick={() => setSaveRetry(value => value + 1)}>重試儲存</Button> :
                <Button variant="outline" onClick={() => downloadStoredRaw(STORAGE_KEY, "原始資料")}>下載原始資料</Button>}
              <Button variant="outline" onClick={() => setIsBackupDialogOpen(true)}>備份與還原</Button>
            </div>
          </div>
        )}
        {storageReady && !backupStatus.hasRecords && !localNoticeDismissed && (
          <div role="status" className="border-b border-primary/20 bg-primary/5">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm sm:px-6 lg:px-8">
              <p><strong>資料存在此瀏覽器。</strong>換手機、改用另一個瀏覽器或安裝主畫面 App 時，資料不會自動同步；之後可用 JSON 備份搬移。</p>
              <Button type="button" variant="outline" size="sm" onClick={dismissLocalNotice}>知道了</Button>
            </div>
          </div>
        )}

        {storageReady && backupStatus.needsAttention && Date.now() >= backupSnoozeUntil && (
          <div role="status" className="border-b border-amber-500/25 bg-amber-500/10">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm sm:px-6 lg:px-8">
              <p>
                <strong>{backupMarker ? "有尚未備份的投資紀錄" : "此裝置尚無備份紀錄"}。</strong>
                {backupMarker
                  ? ` 備份後新增 ${backupStatus.newTransactions} 筆交易；上次產生備份：${formatBackupDate(backupMarker.exportedAt)}。`
                  : " 此裝置的持股與交易只保存在目前瀏覽器，請匯出 JSON 備份。"}
              </p>
              <div className="flex shrink-0 gap-2">
                <Button type="button" size="sm" onClick={() => setIsBackupDialogOpen(true)}>前往備份</Button>
                <Button type="button" variant="outline" size="sm" onClick={snoozeBackupReminder}>稍後提醒</Button>
              </div>
            </div>
          </div>
        )}

        <main className="mx-auto w-full max-w-7xl space-y-6 px-3 pt-6 pb-24 sm:px-6 sm:pb-6 lg:px-8">
          {activeTab === "dashboard" && (
          <section
            id="panel-dashboard"
            role="region"
            aria-labelledby="tab-dashboard"
            className="space-y-6"
          >
          <Panel className="overflow-hidden">
            <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`size-2.5 rounded-full ${syncStatusClass}`} />
                  <h2 className="text-sm font-bold">市場資料連動</h2>
                  <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                    {syncStatusLabel}
                  </span>
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 font-mono text-xs font-semibold text-primary">
                    USD/TWD {usdRate.toFixed(3)}
                  </span>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${fxFreshness(usdRateUpdatedAt, freshnessNow) === "recent" ? "border-border text-muted-foreground" : "border-amber-500/30 text-amber-600 dark:text-amber-400"}`}>
                    匯率{fxFreshness(usdRateUpdatedAt, freshnessNow) === "unknown" ? "尚未更新" : fxFreshness(usdRateUpdatedAt, freshnessNow) === "older" ? "參考日較舊" : "參考日近期"}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {isStandaloneFile
                    ? "單一 HTML 離線版會保留手動價格；開啟工作站網站即可使用行情連動。"
                    : "台股：證交所最新成交／收盤 · 美股：Nasdaq 最新可用行情 · 基金：手動維護公布淨值"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {lastMarketSyncAt
                    ? `上次同步 ${formatBackupDate(lastMarketSyncAt)}`
                    : "尚未完成首次同步"}
                  {usdRateUpdatedAt
                    ? ` · 匯率基準 ${usdRateUpdatedAt.slice(0, 10)}`
                    : ""}
                  {syncSummary.requested > 0
                    ? ` · ${syncSummary.updated}/${syncSummary.requested} 檔已更新`
                    : automaticHoldingCount > 0
                      ? ` · ${automaticHoldingCount} 檔自動行情`
                      : ""}
                  {manualNavCount > 0 ? ` · ${manualNavCount} 檔基金採手動淨值` : ""}
                </p>
                {holdings.length > 0 && (
                  <p className={`mt-2 text-sm ${priceFreshnessSummary.older + priceFreshnessSummary.unknown + priceFreshnessSummary.manual > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                    淨值採用已保存價格：{priceFreshnessSummary.recent} 檔近期、{priceFreshnessSummary.older} 檔逾 24 小時、{priceFreshnessSummary.unknown} 檔時間待確認、{priceFreshnessSummary.manual} 檔手動。
                    {priceFreshnessSummary.unverifiedValue > 0 ? ` 其中 ${money(priceFreshnessSummary.unverifiedValue)} 使用非近期或手動價格。` : ""}
                  </p>
                )}
                {!quoteConsent && automaticHoldingCount > 0 ? (
                  <p className="mt-1 text-xs font-medium text-amber-500">
                    個股行情尚未啟用；首次「立即更新」時會先說明資料傳送範圍。
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {quoteConsent && automaticHoldingCount > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={disableMarketConsent}
                  >
                    停用個股連動
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAutoRefresh((value) => !value)}
                  aria-pressed={autoRefresh}
                >
                  <span
                    className={`size-2 rounded-full ${autoRefresh ? "bg-emerald-500" : "bg-muted-foreground"}`}
                  />
                  {autoRefresh
                    ? quoteConsent
                      ? "每 5 分鐘自動更新"
                      : "匯率每 5 分鐘更新"
                    : "自動更新已暫停"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleMarketRefreshRequest}
                  disabled={syncState === "syncing"}
                >
                  <RefreshCw className={syncState === "syncing" ? "animate-spin" : ""} />
                  立即更新
                </Button>
              </div>
            </div>
            {syncState === "error" ? (
              <div className="border-t border-rose-500/20 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-500 sm:px-5">
                行情服務暫時無法連線；目前淨值仍使用上次成功資料，未覆蓋任何手動價格。
              </div>
            ) : syncState === "partial" ? (
              <div className="border-t border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-500 sm:px-5">
                部分代號未取得行情，這些標的已保留原價格；可檢查代號或改用手動更新。
              </div>
            ) : null}
          </Panel>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="總資產淨值"
              value={money(portfolioSummary.totalMarketValue)}
              detail={<>總投入成本：{money(portfolioSummary.totalCost)}</>}
              icon={<WalletCards className="size-5" />}
            />
            <MetricCard
              label="未實現總損益"
              value={
                <>
                  {portfolioSummary.totalUnrealizedPL >= 0 ? "+" : ""}
                  {money(portfolioSummary.totalUnrealizedPL)}
                </>
              }
              detail={
                <>
                  總報酬率：
                  <span className={gainLossText(portfolioSummary.totalROI)}>
                    {portfolioSummary.totalROI >= 0 ? "+" : ""}
                    {portfolioSummary.totalROI.toFixed(2)}%
                  </span>
                </>
              }
              icon={
                portfolioSummary.totalUnrealizedPL >= 0 ? (
                  <TrendingUp className="size-5" />
                ) : (
                  <TrendingDown className="size-5" />
                )
              }
              valueClass={gainLossText(portfolioSummary.totalUnrealizedPL)}
              iconClass={gainLossBadge(portfolioSummary.totalUnrealizedPL)}
            />
            <MetricCard
              label="今日估算損益"
              value={
                <>
                  {portfolioSummary.totalTodayChange >= 0 ? "+" : ""}
                  {money(portfolioSummary.totalTodayChange)}
                </>
              }
              detail={
                <>
                  單日變動率：
                  <span className={gainLossText(portfolioSummary.todayChangePercent)}>
                    {portfolioSummary.todayChangePercent >= 0 ? "+" : ""}
                    {portfolioSummary.todayChangePercent.toFixed(2)}%
                  </span>
                </>
              }
              icon={<Activity className="size-5" />}
              valueClass={gainLossText(portfolioSummary.totalTodayChange)}
              iconClass="border-cyan-500/20 bg-cyan-500/10 text-cyan-500"
            />
            <MetricCard
              label="預估年領股息"
              value={money(portfolioSummary.totalAnnualDividends)}
              detail={<>加權年化殖利率：{portfolioSummary.dividendYield.toFixed(2)}%</>}
              icon={<Coins className="size-5" />}
              valueClass="text-amber-500"
              iconClass="border-amber-500/20 bg-amber-500/10 text-amber-500"
            />
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Panel className="p-5 sm:p-6">
                <h2 className="flex items-center gap-2 text-base font-bold">
                  <PieChart className="size-5 text-primary" />
                  資產類別配置
                </h2>
                <div className="relative mx-auto my-7 flex size-48 items-center justify-center">
                  <div
                    role="img"
                    aria-label="台股、美股與公募基金資產配置環狀圖"
                    className="absolute inset-0 rounded-full"
                    style={{ background: `conic-gradient(${allocationGradient})` }}
                  />
                  <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-card text-center shadow-inner">
                    <span className="text-xs text-muted-foreground">總資產淨值</span>
                    <span className="mt-1 max-w-32 truncate text-sm font-bold">
                      {money(portfolioSummary.totalMarketValue)}
                    </span>
                  </div>
                </div>
                <div className="space-y-2 border-t border-border pt-4">
                  {categoryAllocation.map((category) => (
                    <div
                      key={category.name}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="size-3 rounded-full"
                          style={{ backgroundColor: category.color }}
                        />
                        {category.name}
                      </span>
                      <span className="font-mono font-semibold">
                        {portfolioSummary.totalMarketValue > 0
                          ? ((category.value / portfolioSummary.totalMarketValue) * 100).toFixed(1)
                          : "0.0"}
                        %
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel className="p-5 sm:p-6 lg:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-base font-bold">
                    <Activity className="size-5 text-primary" />
                    投入成本與目前市值
                  </h2>
                  <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground">
                    依目前輸入資料計算
                  </span>
                </div>
                <div className="mt-8 space-y-7">
                  {[
                    {
                      label: "投入成本",
                      value: portfolioSummary.totalCost,
                      color: "bg-slate-500",
                    },
                    {
                      label: "目前市值",
                      value: portfolioSummary.totalMarketValue,
                      color: "bg-gradient-to-r from-primary to-cyan-400",
                    },
                  ].map((row) => {
                    const max = Math.max(
                      portfolioSummary.totalCost,
                      portfolioSummary.totalMarketValue,
                      1,
                    );
                    return (
                      <div key={row.label} className="space-y-2">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium">{row.label}</span>
                          <span className="font-mono font-bold">{money(row.value)}</span>
                        </div>
                        <div className="h-5 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${row.color}`}
                            style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-8 grid grid-cols-1 gap-3 border-t border-border pt-5 sm:grid-cols-2">
                  <div className="rounded-xl bg-muted/70 p-4">
                    <p className="text-xs text-muted-foreground">市值與成本差額</p>
                    <p className={`mt-1 font-mono text-lg ${gainLossText(portfolioSummary.totalUnrealizedPL)}`}>
                      {portfolioSummary.totalUnrealizedPL >= 0 ? "+" : ""}
                      {money(portfolioSummary.totalUnrealizedPL)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted/70 p-4">
                    <p className="text-xs text-muted-foreground">目前標的數</p>
                    <p className="mt-1 text-lg font-bold">{holdings.length} 檔</p>
                  </div>
                </div>
              </Panel>
            </div>

            <Panel className="p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-base font-bold">
                  <Sparkles className="size-5 text-primary" />
                  權重前三大配置標的
                </h2>
                <Button variant="link" size="sm" onClick={() => handlePrimaryNavChange("holdings")}>
                  檢視全部持股
                  <ArrowUpRight />
                </Button>
              </div>
              {topHoldings.length === 0 ? (
                <EmptyState
                  message="尚未建立持股資料"
                  detail="登記第一筆買入交易後，資產配置與損益會自動計算。"
                  action={
                    <Button type="button" size="sm" onClick={() => handleOpenAddModal()}>
                      <Plus /> 登記第一筆交易
                    </Button>
                  }
                />
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {topHoldings.map((item) => {
                    const marketValue = holdingValueTwd(item);
                    const cost = holdingCostTwd(item);
                    const profitLoss = marketValue - cost;
                    const roi = cost > 0 ? (profitLoss / cost) * 100 : 0;
                    const weight =
                      portfolioSummary.totalMarketValue > 0
                        ? (marketValue / portfolioSummary.totalMarketValue) * 100
                        : 0;
                    return (
                      <div key={item.id} className="rounded-xl border border-border bg-muted/45 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-1 font-mono text-xs font-bold text-primary">
                            {item.symbol}
                          </span>
                          <span className={gainLossText(roi)}>
                            {roi >= 0 ? "+" : ""}
                            {roi.toFixed(2)}%
                          </span>
                        </div>
                        <p className="mt-3 truncate text-sm font-bold">{item.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          權重 {weight.toFixed(1)}% · {item.shares.toLocaleString()} 單位
                        </p>
                        <p className="mt-3 truncate font-mono text-sm font-semibold">
                          {money(marketValue)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>
          </section>
          )}

          {activeTab === "dashboard" && <Panel className="mt-6 space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">實際投資績效</h2>
              <label className="flex items-center gap-2 text-sm">已實現／股息年度<select className="rounded border border-border bg-background p-2" value={performanceYear} onChange={event=>setPerformanceYear(event.target.value)}><option value="ALL">全部年度</option>{performanceYears.map(year=><option key={year} value={year}>{year}</option>)}</select></label>
            </div>
            <p className="text-sm text-muted-foreground">依完整交易履歷計算，買入費稅納入成本、賣出費稅扣除收入，股息扣除已登記費稅。請到「交易 → 編輯」填入實際費稅並勾選已核對；未核對紀錄以估算標示。</p>
            {performance.length===0 ? <p className="text-sm">新增持股與交易後即可查看績效。</p> : <div className="overflow-x-auto"><Table className="min-w-[1050px] text-sm"><TableHeader><TableRow>
              {['標的／狀態','已實現淨損益','實收股息','未實現損益（目前）','累計總損益','累計投入報酬率','台幣總損益'].map(label=><TableHead key={label}>{label}</TableHead>)}
            </TableRow></TableHeader><TableBody>{performance.map(row=>{
              const native=(value:number)=>`${row.currency} ${value.toLocaleString(undefined,{maximumFractionDigits:2})}`;
              const period=performanceYear==='ALL'?row:row.annual[performanceYear]??{realized:0,dividends:0};
              return <TableRow key={row.key}><TableCell><p className="font-bold">{row.name}（{row.symbol}）</p><p className={row.error?'text-destructive':'text-muted-foreground'}>{row.error??(row.verified?'費稅已核對':'估算・費稅待核對')}</p></TableCell>
                <TableCell>{row.error?'—':native(period.realized)}</TableCell><TableCell>{row.error?'—':native(period.dividends)}</TableCell>
                <TableCell>{row.error?'—':native(row.unrealized)}</TableCell><TableCell>{row.error?'—':native(row.total)}</TableCell>
                <TableCell>{row.error||row.returnRate===null?'—':`${row.returnRate.toFixed(2)}%`}</TableCell>
                <TableCell>{row.error?'—':row.twdTotal===null?'缺交易日匯率':`TWD ${row.twdTotal.toLocaleString(undefined,{maximumFractionDigits:2})}`}</TableCell></TableRow>;
            })}</TableBody></Table></div>}
            <p className="text-sm text-muted-foreground">累計總損益＝已實現＋實收股息＋目前未實現；報酬率＝累計總損益÷歷次買入總支出，非年化或時間加權報酬率。年度選擇只篩選已實現與股息，其他欄位維持全期間。未實現採目前價格，行情新鮮度請參考上方標示。美股台幣績效使用各筆交易匯率與目前參考匯率；缺匯率不以現行匯率補算。持股頁均價仍為不含費稅的成交均價。</p>
          </Panel>}

          {activeTab === "holdings" && (
          <section
            id="panel-holdings"
            role="region"
            aria-labelledby="tab-holdings"
            className="space-y-4"
          >
            <Panel className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative min-w-0 flex-1 lg:max-w-md">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={holdingSearch}
                  onChange={(event) => setHoldingSearch(event.target.value)}
                  placeholder="搜尋股票代號或名稱"
                  aria-label="搜尋持股"
                  className="pl-9"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-border bg-muted/40 p-1 scrollbar-none">
                  {(["ALL", ...CATEGORIES] as const).map((category) => (
                    <Button
                      key={category}
                      type="button"
                      size="sm"
                      variant={categoryFilter === category ? "default" : "ghost"}
                      onClick={() => setCategoryFilter(category)}
                      aria-pressed={categoryFilter === category}
                    >
                      {category === "ALL" ? "全部" : category}
                    </Button>
                  ))}
                </div>
                <div className="flex rounded-lg border border-border bg-muted/40 p-1">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant={viewMode === "table" ? "default" : "ghost"}
                    onClick={() => setViewMode("table")}
                    aria-label="表格檢視"
                    aria-pressed={viewMode === "table"}
                  >
                    <List />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant={viewMode === "grid" ? "default" : "ghost"}
                    onClick={() => setViewMode("grid")}
                    aria-label="卡片檢視"
                    aria-pressed={viewMode === "grid"}
                  >
                    <Grid2X2 />
                  </Button>
                </div>
              </div>
            </Panel>

            {viewMode === "table" ? (
              <Panel className="overflow-hidden">
                {filteredHoldings.length === 0 ? (
                  <EmptyState
                    message={holdings.length === 0 ? "尚未建立持股資料" : "找不到符合條件的持股"}
                    detail={
                      holdings.length === 0
                        ? "請先登記一筆買入交易。"
                        : "請調整搜尋文字或分類條件。"
                    }
                    action={
                      holdings.length === 0 ? (
                        <Button type="button" size="sm" onClick={() => handleOpenAddModal()}>
                          <Plus /> 登記交易
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <Table className="min-w-[1080px] text-sm">
                    <TableHeader className="bg-muted/70">
                      <TableRow>
                        <TableHead className="px-4">標的名稱 / 代號</TableHead>
                        <TableHead>類別 / 產業</TableHead>
                        <TableHead className="text-right">持有數量</TableHead>
                        <TableHead className="text-right">平均成本</TableHead>
                        <TableHead className="text-right">目前價格</TableHead>
                        <TableHead className="text-right">總市值</TableHead>
                        <TableHead className="text-right">未實現損益</TableHead>
                        <TableHead className="text-right">ROI</TableHead>
                        <TableHead className="text-center">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredHoldings.map((item) => {
                        const marketValue = holdingValueTwd(item);
                        const cost = holdingCostTwd(item);
                        const profitLoss = marketValue - cost;
                        const roi = cost > 0 ? (profitLoss / cost) * 100 : 0;
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="px-4">
                              <p className="font-bold">{item.name}</p>
                              <p className="font-mono text-xs text-primary">{item.symbol}</p>
                            </TableCell>
                            <TableCell>
                              <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                                {item.category}
                              </span>
                              <p className="mt-1 text-xs text-muted-foreground">{item.sector}</p>
                            </TableCell>
                            <TableCell className="text-right font-mono font-medium">
                              {item.shares.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatNativeMoney(item.avgPrice, item.category)}
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold">
                              <span className="block">
                                {formatNativeMoney(item.currentPrice, item.category)}
                              </span>
                              <span
                                className={`mt-1 block text-xs font-normal ${holdingFreshness(item, freshnessNow) === "recent" ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"}`}
                                title={priceFreshnessDetails(item)}
                              >
                                {priceFreshnessLabel(item)}
                              </span>
                              <span className="mt-0.5 block text-xs font-normal text-muted-foreground" title={priceFreshnessDetails(item)}>
                                {item.quoteCheckedAt ? `查詢 ${formatBackupDate(item.quoteCheckedAt)}` : item.priceUpdatedAt && item.quoteMode === "MANUAL" ? `更新 ${formatBackupDate(item.priceUpdatedAt)}` : "查詢時間未記錄"}
                              </span>
                              {item.quoteMarketTime && (
                                <span className="mt-0.5 block max-w-40 truncate text-xs font-normal text-muted-foreground" title={item.quoteMarketTime}>
                                  來源 {item.quoteMarketTime}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold">
                              {money(marketValue)}
                            </TableCell>
                            <TableCell className={`text-right font-mono ${gainLossText(profitLoss)}`}>
                              {profitLoss >= 0 ? "+" : ""}
                              {money(profitLoss)}
                            </TableCell>
                            <TableCell className={`text-right font-mono ${gainLossText(roi)}`}>
                              {roi >= 0 ? "+" : ""}
                              {roi.toFixed(2)}%
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-1">
                                {renderHoldingTransactionMenu(item, true)}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => handleOpenAddModal(item)}
                                  aria-label={`編輯 ${item.name}`}
                                >
                                  <Edit2 className="text-primary" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => setPendingDelete(item)}
                                  aria-label={`刪除 ${item.name}`}
                                >
                                  <Trash2 className="text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </Panel>
            ) : filteredHoldings.length === 0 ? (
              <Panel>
                <EmptyState
                  message={holdings.length === 0 ? "尚未建立持股資料" : "找不到符合條件的持股"}
                  detail={
                    holdings.length === 0
                      ? "請先登記一筆買入交易。"
                      : "請調整搜尋文字或分類條件。"
                  }
                  action={
                    holdings.length === 0 ? (
                      <Button type="button" size="sm" onClick={() => handleOpenAddModal()}>
                        <Plus /> 登記交易
                      </Button>
                    ) : undefined
                  }
                />
              </Panel>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredHoldings.map((item) => {
                  const marketValue = holdingValueTwd(item);
                  const cost = holdingCostTwd(item);
                  const profitLoss = marketValue - cost;
                  const roi = cost > 0 ? (profitLoss / cost) * 100 : 0;
                  return (
                    <Panel key={item.id} className="flex flex-col justify-between p-5">
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                              {item.category} · {item.sector}
                            </span>
                            <h3 className="mt-3 truncate font-bold">{item.name}</h3>
                            <p className="font-mono text-sm text-primary">{item.symbol}</p>
                          </div>
                          <span className={`rounded-lg border px-2 py-1 text-xs ${gainLossBadge(roi)}`}>
                            {roi >= 0 ? "+" : ""}
                            {roi.toFixed(2)}%
                          </span>
                        </div>
                        <div className="mt-5 space-y-3 rounded-xl border border-border bg-muted/50 p-4 text-sm">
                          <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">持有數量</span>
                            <span className="font-mono font-bold">
                              {item.shares.toLocaleString()} 單位
                            </span>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">
                              {item.category === "公募基金" ? "目前淨值" : "目前價格"}
                            </span>
                            <span className="text-right font-mono font-bold">
                              {formatNativeMoney(item.currentPrice, item.category)}
                              <span
                                className={`mt-1 block font-sans text-xs font-normal ${holdingFreshness(item, freshnessNow) === "recent" ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"}`}
                              >
                                {priceFreshnessLabel(item)}
                              </span>
                            </span>
                          </div>
                          <p className="break-words text-xs leading-5 text-muted-foreground">{priceFreshnessDetails(item)}</p>
                          <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">目前市值</span>
                            <span className="font-mono font-bold">{money(marketValue)}</span>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">未實現損益</span>
                            <span className={`font-mono ${gainLossText(profitLoss)}`}>
                              {profitLoss >= 0 ? "+" : ""}
                              {money(profitLoss)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
                        {renderHoldingTransactionMenu(item)}
                        <Button variant="outline" size="sm" onClick={() => handleOpenAddModal(item)}>
                          <Edit2 /> 編輯
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setPendingDelete(item)}
                          aria-label={`刪除 ${item.name}`}
                        >
                          <Trash2 className="text-destructive" />
                        </Button>
                      </div>
                    </Panel>
                  );
                })}
              </div>
            )}
          </section>
          )}

          {activeTab === "transactions" && (
          <section
            id="panel-transactions"
            role="region"
            aria-labelledby="tab-transactions"
            className="space-y-4"
          >
            {reconciliationIssues.length > 0 && <div role="alert" className="space-y-2 rounded-xl border border-destructive p-4 text-sm">
              <p className="font-bold">對帳未通過：{reconciliationIssues.length} 檔持股與交易履歷不一致</p>
              {reconciliationIssues.map(({holding, position}) => <p key={holding.id}>{holding.name}（{holding.symbol}）：持股 {holding.shares}、均價 {holding.avgPrice}；履歷 {position ? `${position.shares}、均價 ${Math.round(position.avgPrice * 10000) / 10000}` : "無法重算"}</p>)}
              <p>這些標的的歷史買賣編輯／刪除會阻止套用。請核對持股數量、平均成本或補齊交易。現價不參與對帳；股息編輯不改變持股。</p>
            </div>}
            <Panel className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold">
                  <CalendarDays className="size-5 text-primary" />
                  交易履歷與費用紀錄
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  買入、賣出與股息紀錄；費用與稅額為估算值。
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {lastTransactionUndo && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => undoTransaction(lastTransactionUndo)}
                  >
                    <RotateCcw /> 復原上一筆
                  </Button>
                )}
                <Button type="button" size="sm" onClick={() => handleOpenAddModal()}>
                  <Plus /> 登記新交易
                </Button>
              </div>
            </Panel>
            <Panel className="overflow-hidden">
              <p className="px-4 pt-4 text-sm text-muted-foreground">補登交易會依日期核對持股數量與平均成本；交易紀錄不完整時會提示核對，不會自行改寫既有成本。平均成本依成交價計算，預估費稅另列。</p>
              {transactions.length === 0 ? (
                <EmptyState
                  message="尚未有交易紀錄"
                  detail="買入、賣出或股息登記完成後，交易履歷會顯示在這裡。"
                  action={
                    <Button type="button" size="sm" onClick={() => handleOpenAddModal()}>
                      <Plus /> 登記第一筆交易
                    </Button>
                  }
                />
              ) : (
                <Table className="min-w-[980px] text-sm">
                <TableHeader className="bg-muted/70">
                  <TableRow>
                    <TableHead className="px-4">日期</TableHead>
                    <TableHead>類型</TableHead>
                    <TableHead>標的名稱 / 代號</TableHead>
                    <TableHead className="text-right">數量</TableHead>
                    <TableHead className="text-right">成交價</TableHead>
                    <TableHead className="text-right">費用 / 稅額</TableHead>
                    <TableHead className="text-right">交易總額</TableHead>
                    <TableHead>備註</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedTransactions.map((transaction) => {
                    const typeLabel =
                      transaction.type === "BUY"
                        ? "買入"
                        : transaction.type === "SELL"
                          ? "賣出"
                          : "現金股利";
                    const typeClass =
                      transaction.type === "BUY"
                        ? "border-indigo-500/25 bg-indigo-500/10 text-indigo-400"
                        : transaction.type === "SELL"
                          ? "border-rose-500/25 bg-rose-500/10 text-rose-500"
                          : "border-amber-500/25 bg-amber-500/10 text-amber-500";
                    return (
                      <TableRow key={transaction.id}>
                        <TableCell className="px-4 font-mono">{transaction.date}</TableCell>
                        <TableCell>
                          <span className={`rounded-md border px-2 py-1 text-xs font-bold ${typeClass}`}>
                            {typeLabel}
                          </span>
                        </TableCell>
                        <TableCell>
                          <p className="font-bold">{transaction.name}</p>
                          <p className="font-mono text-xs text-primary">{transaction.symbol}</p>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {transaction.shares?.toLocaleString() ?? "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {transaction.price != null
                            ? formatNativeMoney(transaction.price, transaction.category)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          {formatNativeMoney(
                            (transaction.fee ?? 0) + (transaction.tax ?? 0),
                            transaction.category,
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {money(transactionValueTwd(transaction))}
                        </TableCell>
                        <TableCell className="max-w-56 whitespace-normal text-muted-foreground">
                          {transaction.note || "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" disabled={!storageReady} onClick={() => setHistoryEdit({original: transaction, draft: {...transaction}, deleting: false})}>編輯</Button>
                            <Button size="sm" variant="outline" disabled={!storageReady} onClick={() => setHistoryEdit({original: transaction, draft: {...transaction}, deleting: true})}>刪除</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                </Table>
              )}
            </Panel>
          </section>
          )}

          {activeTab === "dividends" && (
          <section
            id="panel-dividends"
            role="region"
            aria-labelledby="tab-dividends"
            className="space-y-6"
          >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Panel className="p-5 sm:p-6 lg:col-span-2">
                <h2 className="flex items-center gap-2 text-base font-bold">
                  <BarChart3 className="size-5 text-primary" />
                  預估年度股息日曆
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  依各標的年化殖利率與配息月份平均分攤估算。
                </p>
                <div className="mt-6 flex h-60 items-end gap-1.5 border-b border-border px-1 pb-2 sm:gap-2">
                  {dividendByMonth.map((month) => {
                    const max = Math.max(...dividendByMonth.map((item) => item.amount), 1);
                    const height = month.amount > 0 ? Math.max(4, (month.amount / max) * 100) : 1;
                    return (
                      <div
                        key={month.month}
                        className="group flex h-full flex-1 flex-col items-center justify-end gap-2"
                        title={`${month.month} 月：${money(month.amount)}`}
                      >
                        <span className="hidden text-xs font-semibold text-primary group-hover:block sm:block">
                          {month.amount > 0 ? Math.round(month.amount / 1000) + "k" : "—"}
                        </span>
                        <div
                          className="w-full min-w-2 rounded-t-md bg-gradient-to-t from-primary to-amber-400 opacity-85 transition-opacity group-hover:opacity-100"
                          style={{ height: `${height}%` }}
                        />
                        <span className="text-[12px] text-muted-foreground">{month.month}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">預估全年股息總額</span>
                  <span className="font-mono text-lg font-bold text-amber-500">
                    {money(portfolioSummary.totalAnnualDividends)}
                  </span>
                </div>
              </Panel>

              <Panel className="flex flex-col justify-between p-5 sm:p-6">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-bold">
                    <Coins className="size-5 text-amber-500" />
                    殖利率排行
                  </h2>
                  <div className="mt-4 space-y-3">
                    {holdings.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                        建立持股後會顯示殖利率排行。
                      </div>
                    ) : (
                      holdings
                        .slice()
                        .sort((a, b) => b.divRate - a.divRate)
                        .slice(0, 4)
                        .map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/45 p-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold">{item.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {item.symbol} · 年化 {item.divRate}%
                              </p>
                            </div>
                            <span className="shrink-0 text-right font-mono text-xs font-bold text-amber-500">
                              {money(holdingValueTwd(item) * (item.divRate / 100))}
                              <span className="block font-sans font-normal text-muted-foreground">/ 年</span>
                            </span>
                          </div>
                        ))
                    )}
                  </div>
                </div>
                <div className="mt-4 flex gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-500">
                  <Info className="mt-0.5 size-4 shrink-0" />
                  <span>殖利率與配息均為估算，請以實際公告為準。</span>
                </div>
              </Panel>
            </div>

            <Panel className="p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-base font-bold">
                  <Layers3 className="size-5 text-primary" />
                  產業曝險分布
                </h2>
                <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs text-primary">
                  與匯率及最新淨值連動
                </span>
              </div>
              {sectorAllocation.length === 0 ? (
                <div className="mt-5 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  尚未有可分析的持股資料。
                </div>
              ) : (
                <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
                  {sectorAllocation.map((sector, index) => {
                  const percentage =
                    portfolioSummary.totalMarketValue > 0
                      ? (sector.value / portfolioSummary.totalMarketValue) * 100
                      : 0;
                  const colorClasses = [
                    "bg-chart-1",
                    "bg-chart-2",
                    "bg-chart-3",
                    "bg-chart-4",
                    "bg-chart-5",
                  ];
                  return (
                    <div key={sector.name} className="space-y-2">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate font-medium">{sector.name}</span>
                        <span className="font-mono font-semibold">{percentage.toFixed(1)}%</span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${colorClasses[index % colorClasses.length]}`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                  })}
                </div>
              )}
            </Panel>
          </section>
          )}

          {activeTab === "dca" && (
          <section
            id="panel-dca"
            role="region"
            aria-labelledby="tab-dca"
          >
            <Panel className="p-5 sm:p-6">
              <h2 className="flex items-center gap-2 text-base font-bold">
                <Calculator className="size-5 text-primary" />
                定期定額複利試算器
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                試算規律投入在固定報酬率假設下的長期結果。
              </p>
              <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="space-y-5">
                  <label className="block space-y-2 text-sm font-semibold">
                    <span>期初單筆投入（TWD）</span>
                    <Input
                      type="number"
                      min="0"
                      step="1000"
                      value={dcaInitial}
                      onChange={(event) => setDcaInitial(Math.max(0, Number(event.target.value)))}
                      className="font-mono"
                    />
                  </label>
                  <label className="block space-y-2 text-sm font-semibold">
                    <span>每月定期投入（TWD）</span>
                    <Input
                      type="number"
                      min="0"
                      step="1000"
                      value={dcaMonthly}
                      onChange={(event) => setDcaMonthly(Math.max(0, Number(event.target.value)))}
                      className="font-mono"
                    />
                  </label>
                  <label className="block space-y-3 text-sm font-semibold">
                    <span className="flex justify-between">
                      預期年化報酬率 <b className="text-primary">{dcaRate}%</b>
                    </span>
                    <Slider
                      min={0}
                      max={20}
                      step={0.5}
                      value={[dcaRate]}
                      onValueChange={(value) => setDcaRate(value[0] ?? 0)}
                      aria-label="預期年化報酬率"
                    />
                  </label>
                  <label className="block space-y-3 text-sm font-semibold">
                    <span className="flex justify-between">
                      投資時間 <b className="text-primary">{dcaYears} 年</b>
                    </span>
                    <Slider
                      min={1}
                      max={30}
                      step={1}
                      value={[dcaYears]}
                      onValueChange={(value) => setDcaYears(value[0] ?? 1)}
                      aria-label="投資時間"
                    />
                  </label>
                </div>

                <div className="space-y-6 rounded-2xl border border-border bg-muted/45 p-5 lg:col-span-2">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-xl border border-border bg-card p-4 text-center">
                      <p className="text-xs text-muted-foreground">總投入本金</p>
                      <p className="mt-2 truncate font-mono font-bold">
                        {money(dcaResult.totalCost)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4 text-center">
                      <p className="text-xs text-muted-foreground">預估複利獲利</p>
                      <p className="mt-2 truncate font-mono font-bold text-emerald-500">
                        +{money(dcaResult.totalProfit)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-center">
                      <p className="text-xs text-muted-foreground">預估期末資產</p>
                      <p className="mt-2 truncate font-mono text-lg font-bold text-primary">
                        {money(dcaResult.futureValue)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap justify-between gap-2 text-xs">
                      <span>
                        本金占比（
                        {dcaResult.futureValue > 0
                          ? ((dcaResult.totalCost / dcaResult.futureValue) * 100).toFixed(1)
                          : "0.0"}
                        %）
                      </span>
                      <span className="text-primary">
                        複利獲利占比（
                        {dcaResult.futureValue > 0
                          ? ((dcaResult.totalProfit / dcaResult.futureValue) * 100).toFixed(1)
                          : "0.0"}
                        %）
                      </span>
                    </div>
                    <div className="flex h-4 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-slate-500"
                        style={{
                          width: `${
                            dcaResult.futureValue > 0
                              ? (dcaResult.totalCost / dcaResult.futureValue) * 100
                              : 0
                          }%`,
                        }}
                      />
                      <div
                        className="h-full bg-gradient-to-r from-primary to-cyan-400"
                        style={{
                          width: `${
                            dcaResult.futureValue > 0
                              ? (dcaResult.totalProfit / dcaResult.futureValue) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 rounded-xl border border-primary/20 bg-primary/10 p-4 text-sm text-primary">
                    <Info className="mt-0.5 size-4 shrink-0" />
                    <span>
                      試算未納入手續費、稅負、匯率與市場波動；結果僅供規劃參考，不構成投資建議。
                    </span>
                  </div>
                </div>
              </div>
            </Panel>
          </section>
          )}
        </main>
      </div>

      <Button
        type="button"
        size="lg"
        className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-30 h-12 rounded-full px-4 shadow-xl shadow-primary/25 sm:hidden"
        onClick={() => handleOpenAddModal()}
      >
        <Plus /> 交易
      </Button>

      <Dialog open={isMarketConsentOpen} onOpenChange={setIsMarketConsentOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="size-5 text-primary" />
              啟用個股行情連動
            </DialogTitle>
            <DialogDescription>
              為取得最新價格，網站需要向公開行情來源查詢你的標的代號。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-xl border border-border bg-muted/45 p-4">
              <p className="font-semibold">只會傳送</p>
              <p className="mt-1 text-muted-foreground">市場類別與股票／ETF 代號。</p>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="font-semibold text-emerald-500">不會傳送</p>
              <p className="mt-1 text-muted-foreground">
                持有數量、成本、資產金額、標的自訂名稱、交易紀錄或基金淨值。
              </p>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              台股代號會查詢臺灣證券交易所即時資訊服務；美股代號會查詢 Nasdaq
              公開行情。你可隨時把個別標的改為「保留手動價格」。
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsMarketConsentOpen(false)}>
              先不要
            </Button>
            <Button type="button" onClick={confirmMarketConsent}>
              同意並立即更新
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isBackupDialogOpen} onOpenChange={setIsBackupDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DatabaseBackup className="size-5 text-primary" />
              資料備份與還原
            </DialogTitle>
            <DialogDescription>
              資料只存在目前瀏覽器；換裝置或安裝主畫面 App 不會自動同步。可在舊裝置匯出 JSON，再到新裝置匯入還原。
            </DialogDescription>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            {backupMarker
              ? `此裝置上次產生備份下載：${formatBackupDate(backupMarker.exportedAt)}${backupStatus.changed ? `；之後新增 ${backupStatus.newTransactions} 筆交易，資料已變動` : "；目前沒有偵測到持股或交易異動"}。`
              : "此裝置尚未記錄備份下載；若已有資料，請先匯出完整備份。"}
            下載後請確認 JSON 檔已存好，網站不會保管備份檔。
          </p>

          <div className="rounded-xl border border-border bg-muted/45 p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">目前可備份資料</span>
              <span className="font-semibold">
                {holdings.length} 筆持股 · {transactions.length} 筆交易
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="h-auto justify-start gap-3 whitespace-normal p-4 text-left"
              onClick={handleExportBackup}
            >
              <Download className="size-5 shrink-0 text-primary" />
              <span>
                <span className="block font-bold">匯出完整備份</span>
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  下載 JSON 備份檔
                </span>
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto justify-start gap-3 whitespace-normal p-4 text-left"
              onClick={() => backupInputRef.current?.click()}
            >
              <Upload className="size-5 shrink-0 text-primary" />
              <span>
                <span className="block font-bold">匯入並還原</span>
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  選擇先前的 JSON 檔
                </span>
              </span>
            </Button>
          </div>

          {hasHistoryRecovery && (
            <div className="space-y-2 rounded-xl border border-border p-4 text-sm">
              <p className="font-bold">歷史交易操作前快照</p>
              <p>保留最近一次編輯或刪除前的完整資料。下載後可匯入復原；會覆蓋快照之後的所有變更。</p>
              <Button variant="outline" onClick={() => downloadStoredRaw(HISTORY_RECOVERY_KEY, "交易操作前快照")}>下載交易操作前快照</Button>
            </div>
          )}
          {hasRestoreRecovery && (
            <div className="space-y-2 rounded-xl border border-border p-4 text-sm">
              <p className="font-bold">還原前復原快照</p>
              <p>保留最近一次還原前的資料。下載後可由「匯入備份」復原；下次還原會替換此快照。同一瀏覽器內的快照不能代替外部備份。</p>
              <Button variant="outline" onClick={() => downloadStoredRaw(RESTORE_RECOVERY_KEY, "還原前快照")}>下載復原快照</Button>
            </div>
          )}
          {hasLegacyRecovery ? (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm">
              <p className="font-semibold text-amber-500">已保留更新前資料</p>
              <p className="mt-1 text-xs text-muted-foreground">
                系統移除舊版示範項目前，已在此瀏覽器建立一次性復原備份。
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={handleDownloadLegacyRecovery}
              >
                <Download /> 下載更新前資料
              </Button>
            </div>
          ) : null}

          <input
            ref={backupInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="選擇 SmartPortfolio 備份檔"
            onChange={handleImportBackup}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsBackupDialogOpen(false)}>
              關閉
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isInstallDialogOpen} onOpenChange={setIsInstallDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="size-5 text-primary" />
              安裝 SmartPortfolio
            </DialogTitle>
            <DialogDescription>
              安裝後可從主畫面直接開啟，也能在離線時查看已保存的資料。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="rounded-xl border border-border bg-muted/45 p-4">
              <p className="font-semibold">iPhone／iPad</p>
              <p className="mt-1 leading-6 text-muted-foreground">
                請用 Safari 開啟網站，點「分享」，再選「加入主畫面」。
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted/45 p-4">
              <p className="font-semibold">Android／Windows</p>
              <p className="mt-1 leading-6 text-muted-foreground">
                請使用瀏覽器選單中的「安裝應用程式」或「加到主畫面」。
              </p>
            </div>
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
              <p className="font-semibold text-amber-600 dark:text-amber-400">
                安裝前建議先備份
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                主畫面 App 可能使用不同的本機儲存空間；若首次開啟未看到原有資料，可匯入 JSON 備份還原。{backupStatus.hasRecords ? (backupStatus.changed || !backupMarker ? "目前資料有異動或尚無備份紀錄。" : `此裝置上次產生備份下載：${formatBackupDate(backupMarker.exportedAt)}。`) : "目前尚無投資紀錄。"}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsInstallDialogOpen(false)}
            >
              關閉
            </Button>
            <Button
              type="button"
              onClick={() => {
                setIsInstallDialogOpen(false);
                setIsBackupDialogOpen(true);
              }}
            >
              <DatabaseBackup /> 先備份資料
            </Button>
            {installPrompt && (
              <Button type="button" variant="outline" onClick={() => void promptNativeInstall()}>
                繼續安裝
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(navUpdateHolding)}
        onOpenChange={(open) => {
          if (!open) setNavUpdateHolding(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="size-5 text-primary" />
              更新基金淨值
            </DialogTitle>
            <DialogDescription>
              只更新目前公布淨值，不會新增買賣交易。
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveNavUpdate} className="space-y-4">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="font-bold">{navUpdateHolding?.name}</p>
              <div className="mt-1 flex items-center justify-between gap-3 text-sm text-muted-foreground">
                <span className="font-mono">{navUpdateHolding?.symbol}</span>
                <span>
                  目前 {navUpdateHolding
                    ? formatNativeMoney(
                        navUpdateHolding.currentPrice,
                        navUpdateHolding.category,
                      )
                    : "—"}
                </span>
              </div>
            </div>

            <label className="block space-y-1.5 text-sm font-semibold">
              <span>最新公布淨值（TWD）</span>
              <Input
                type="number"
                min="0"
                step="0.0001"
                value={navUpdateValue}
                onChange={(event) => setNavUpdateValue(event.target.value)}
                className="font-mono"
                autoFocus
                required
              />
            </label>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNavUpdateHolding(null)}>
                取消
              </Button>
              <Button type="submit">確認更新</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingHolding ? <Edit2 className="size-5 text-primary" /> : <Plus className="size-5 text-primary" />}
              {editingHolding ? "編輯持股資訊" : "登記交易紀錄"}
            </DialogTitle>
            <DialogDescription>
              {editingHolding
                ? "修正持有數量、成本、現價與配息設定。"
                : "交易會同步更新持股；股息只會加入交易履歷。"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveTransaction} className="space-y-4">
            {!editingHolding && (
              <>
                <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-muted/40 p-1">
                  {(
                    [
                      ["BUY", "買入"],
                      ["SELL", "賣出"],
                      ["DIVIDEND", "股息"],
                    ] as const
                  ).map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={formType === value ? "default" : "ghost"}
                      onClick={() => handleTransactionTypeChange(value)}
                      disabled={value === "SELL" && holdings.every((item) => item.shares <= 0)}
                      aria-pressed={formType === value}
                    >
                      {formType === value && <Check />}
                      {label}
                    </Button>
                  ))}
                </div>

                {recentFormHoldings.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">最近使用</p>
                    <div className="flex flex-wrap gap-2">
                      {recentFormHoldings.map((holding) => (
                        <Button
                          key={holding.id}
                          type="button"
                          size="sm"
                          variant={formHoldingId === holding.id ? "default" : "outline"}
                          onClick={() => handleFormHoldingChange(holding.id)}
                        >
                          {holding.symbol}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <label className="block space-y-1.5 text-sm font-semibold">
                  <span>
                    {formType === "BUY" ? "選擇標的或新增標的" : "選擇標的"}
                  </span>
                  <Select
                    value={formHoldingId || undefined}
                    onValueChange={handleFormHoldingChange}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="請選擇既有持股" />
                    </SelectTrigger>
                    <SelectContent>
                      {(formType === "BUY" || formType === "DIVIDEND") && (
                        <SelectItem value={MANUAL_HOLDING_ID}>
                          {formType === "BUY"
                            ? "新增標的（手動輸入）"
                            : "其他／已賣出標的（手動輸入）"}
                        </SelectItem>
                      )}
                      {transactionHoldingOptions.map((holding) => (
                        <SelectItem key={holding.id} value={holding.id}>
                          {holding.name} · {holding.symbol}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                {selectedFormHolding ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{selectedFormHolding.name}</p>
                      <p className="font-mono text-xs text-primary">
                        {selectedFormHolding.symbol} · {selectedFormHolding.category}
                      </p>
                    </div>
                    <p className="shrink-0 text-right text-xs text-muted-foreground">
                      持有
                      <span className="ml-1 block font-mono font-bold text-foreground sm:inline">
                        {selectedFormHolding.shares.toLocaleString()} 單位
                      </span>
                    </p>
                  </div>
                ) : null}

                <fieldset className="space-y-2">
                  <legend className="text-sm font-semibold">交易日期</legend>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={!showCustomDate && formDate === todayDate ? "default" : "outline"}
                      onClick={() => {
                        setFormDate(todayDate);
                        setShowCustomDate(false);
                      }}
                      aria-pressed={!showCustomDate && formDate === todayDate}
                    >
                      今天
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={!showCustomDate && formDate === yesterdayDate ? "default" : "outline"}
                      onClick={() => {
                        setFormDate(yesterdayDate);
                        setShowCustomDate(false);
                      }}
                      aria-pressed={!showCustomDate && formDate === yesterdayDate}
                    >
                      昨天
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={showCustomDate ? "default" : "outline"}
                      onClick={() => setShowCustomDate(true)}
                      aria-pressed={showCustomDate}
                    >
                      自訂日期
                    </Button>
                  </div>
                  {showCustomDate && (
                    <Input
                      type="date"
                      value={formDate}
                      max={todayDate}
                      onChange={(event) => setFormDate(event.target.value)}
                      className="font-mono"
                      aria-label="自訂交易日期"
                      required
                    />
                  )}
                </fieldset>
              </>
            )}

            {(editingHolding || isManualTransaction) && (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5 text-sm font-semibold">
                    <span>標的類別</span>
                    <Select
                      value={formCategory}
                      onValueChange={(value) => {
                        const category = value as Category;
                        setFormCategory(category);
                        setFormQuoteMode(category === "公募基金" ? "MANUAL" : "AUTO");
                      }}
                      disabled={Boolean(editingHolding)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="space-y-1.5 text-sm font-semibold">
                    <span>標的代號</span>
                    <Input
                      value={formSymbol}
                      onChange={(event) => setFormSymbol(event.target.value)}
                      placeholder="例如 1234、ABCD"
                      required
                    />
                  </label>
                </div>

                <label className="block space-y-1.5 text-sm font-semibold">
                  <span>標的名稱</span>
                  <Input
                    value={formName}
                    onChange={(event) => setFormName(event.target.value)}
                    placeholder="例如 台股 ETF、科技公司"
                    required
                  />
                </label>
              </>
            )}

            {editingHolding ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <label className="space-y-1.5 text-sm font-semibold">
                  <span>持有數量</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={formShares}
                    onChange={(event) => setFormShares(event.target.value)}
                    className="font-mono"
                    required
                  />
                </label>
                <label className="space-y-1.5 text-sm font-semibold">
                  <span>平均成本</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={formAvgPrice}
                    onChange={(event) => setFormAvgPrice(event.target.value)}
                    className="font-mono"
                    required
                  />
                </label>
                <label className="space-y-1.5 text-sm font-semibold">
                  <span>{formCategory === "公募基金" ? "目前公布淨值" : "目前價格"}</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={formPrice}
                    onChange={(event) => setFormPrice(event.target.value)}
                    className="font-mono"
                    required
                  />
                </label>
              </div>
            ) : hasTransactionTarget && formType === "DIVIDEND" ? (
              <label className="block space-y-1.5 text-sm font-semibold">
                <span>實收股息（{formCategory === "美股" ? "USD" : "TWD"}）</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formAmount}
                  onChange={(event) => setFormAmount(event.target.value)}
                  placeholder="6200"
                  className="font-mono"
                  required
                />
              </label>
            ) : hasTransactionTarget ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-semibold">
                  <span>交易數量</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={formShares}
                    onChange={(event) => setFormShares(event.target.value)}
                    placeholder="1000"
                    className="font-mono"
                    required
                  />
                </label>
                <label className="space-y-1.5 text-sm font-semibold">
                  <span>成交價格（{formCategory === "美股" ? "USD" : "TWD"}）</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={formPrice}
                    onChange={(event) => setFormPrice(event.target.value)}
                    placeholder="975"
                    className="font-mono"
                    required
                  />
                </label>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-muted/35 px-4 py-5 text-center text-sm text-muted-foreground">
                請先選擇一個既有持股，再填寫交易內容。
              </div>
            )}

            {editingHolding && (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5 text-sm font-semibold">
                    <span>產業 / 分類</span>
                    <Input
                      value={formSector}
                      onChange={(event) => setFormSector(event.target.value)}
                      placeholder="例如 半導體、指數ETF"
                    />
                  </label>
                  <label className="space-y-1.5 text-sm font-semibold">
                    <span>預估年殖利率（%）</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      value={formDivRate}
                      onChange={(event) => setFormDivRate(event.target.value)}
                      className="font-mono"
                    />
                  </label>
                </div>
                <label className="block space-y-1.5 text-sm font-semibold">
                  <span>
                    {formCategory === "公募基金" ? "基金淨值更新方式" : "行情更新方式"}
                  </span>
                  <Select
                    value={formCategory === "公募基金" ? "MANUAL" : formQuoteMode}
                    onValueChange={(value) => setFormQuoteMode(value as QuoteMode)}
                    disabled={formCategory === "公募基金"}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AUTO">每 5 分鐘自動取得最新行情</SelectItem>
                      <SelectItem value="MANUAL">
                        {formCategory === "公募基金" ? "手動輸入公布淨值" : "保留手動價格"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {formCategory === "公募基金"
                      ? "免費來源無法穩定涵蓋所有基金，因此不會自動覆蓋你輸入的公布淨值。"
                      : "自動更新失敗時會保留上次價格；也可改成手動模式。"}
                  </span>
                </label>
                <label className="block space-y-1.5 text-sm font-semibold">
                  <span>預估配息月份</span>
                  <Input
                    value={formDivMonths}
                    onChange={(event) => setFormDivMonths(event.target.value)}
                    placeholder="例如 3,6,9,12"
                    className="font-mono"
                  />
                  <span className="block text-xs font-normal text-muted-foreground">
                    以逗號分隔 1–12 月；股息日曆會依此平均分配。
                  </span>
                </label>
              </>
            )}

            {!editingHolding && (
              <div className="rounded-xl border border-border">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-between rounded-xl px-4"
                  onClick={() => setShowAdvancedFields((value) => !value)}
                  aria-expanded={showAdvancedFields}
                >
                  <span>更多設定</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {showAdvancedFields
                      ? "收合"
                      : formType === "BUY" && isManualTransaction
                        ? "產業、配息與備註"
                        : "備註"}
                  </span>
                </Button>

                {showAdvancedFields && (
                  <div className="space-y-4 border-t border-border p-4">
                    {formType === "BUY" && isManualTransaction && (
                      <>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <label className="space-y-1.5 text-sm font-semibold">
                            <span>產業 / 分類</span>
                            <Input
                              value={formSector}
                              onChange={(event) => setFormSector(event.target.value)}
                              placeholder="例如 半導體、指數ETF"
                            />
                          </label>
                          <label className="space-y-1.5 text-sm font-semibold">
                            <span>預估年殖利率（%）</span>
                            <Input
                              type="number"
                              min="0"
                              step="0.1"
                              value={formDivRate}
                              onChange={(event) => setFormDivRate(event.target.value)}
                              className="font-mono"
                            />
                          </label>
                        </div>
                        <label className="block space-y-1.5 text-sm font-semibold">
                          <span>行情更新方式</span>
                          <Select
                            value={formCategory === "公募基金" ? "MANUAL" : formQuoteMode}
                            onValueChange={(value) => setFormQuoteMode(value as QuoteMode)}
                            disabled={formCategory === "公募基金"}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="AUTO">每 5 分鐘自動取得最新行情</SelectItem>
                              <SelectItem value="MANUAL">
                                {formCategory === "公募基金" ? "手動輸入公布淨值" : "保留手動價格"}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </label>
                        <label className="block space-y-1.5 text-sm font-semibold">
                          <span>預估配息月份</span>
                          <Input
                            value={formDivMonths}
                            onChange={(event) => setFormDivMonths(event.target.value)}
                            placeholder="例如 3,6,9,12"
                            className="font-mono"
                          />
                        </label>
                      </>
                    )}
                    <label className="block space-y-1.5 text-sm font-semibold">
                      <span>備註</span>
                      <Input
                        value={formNote}
                        onChange={(event) => setFormNote(event.target.value)}
                        placeholder="選填"
                      />
                    </label>
                  </div>
                )}
              </div>
            )}

            {!editingHolding && transactionPreview && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4" aria-live="polite">
                {transactionPreview.error && (
                  <p className="mb-2 text-sm font-semibold text-destructive">{transactionPreview.error}</p>
                )}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-primary">交易摘要</p>
                    <p className="mt-1 text-sm font-bold">
                      {transactionPreview.label} · {transactionPreview.name}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {transactionPreview.symbol} · {transactionPreview.date}
                    </p>
                  </div>
                  <p className="text-right font-mono font-bold">
                    {formatNativeMoney(transactionPreview.gross, formCategory)}
                  </p>
                </div>
                {(transactionPreview.fee > 0 || transactionPreview.tax > 0 || transactionPreview.remainingShares != null) && (
                  <div className="mt-3 flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-primary/15 pt-3 text-xs text-muted-foreground">
                    {transactionPreview.fee > 0 || transactionPreview.tax > 0 ? (
                      <span>
                        預估費稅 {formatNativeMoney(transactionPreview.fee + transactionPreview.tax, formCategory)}
                      </span>
                    ) : null}
                    {transactionPreview.remainingShares != null ? (
                      <span className={transactionPreview.remainingShares < 0 ? "font-semibold text-destructive" : ""}>
                        {transactionPreview.remainingShares < 0
                          ? `超過持股 ${Math.abs(transactionPreview.remainingShares).toLocaleString()} 單位`
                          : `賣出後剩餘 ${transactionPreview.remainingShares.toLocaleString()} 單位`}
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>
                取消
              </Button>
              <Button
                type="submit"
                disabled={
                  !editingHolding &&
                  (!transactionPreview ||
                    Boolean(transactionPreview.error) ||
                    (transactionPreview.remainingShares != null &&
                      transactionPreview.remainingShares < 0))
                }
              >
                {editingHolding ? "儲存修改" : "確認並儲存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(historyEdit)} onOpenChange={(open) => { if (!open) setHistoryEdit(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{historyEdit?.deleting ? "刪除歷史交易" : "編輯歷史交易"}</DialogTitle>
            <DialogDescription>{historyEdit?.original.name}（{historyEdit?.original.symbol}）・{historyEdit?.original.type === "BUY" ? "買入" : historyEdit?.original.type === "SELL" ? "賣出" : "股息"}。標的與類型固定；同日交易保留原登記順序。</DialogDescription>
          </DialogHeader>
          {historyEdit && <>
            <p className="text-sm">原紀錄：{historyEdit.original.date}・{historyEdit.original.type === "DIVIDEND" ? `股息 ${historyEdit.original.amount}` : `${historyEdit.original.shares} 股／單位 × ${historyEdit.original.price}`}</p>
            {!historyEdit.deleting && <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-3 rounded-xl bg-muted p-3 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={historyEdit.draft.costsVerified === true} onChange={event => setHistoryEdit({...historyEdit,draft:{...historyEdit.draft,costsVerified:event.target.checked}})} />已依對帳單核對成交金額、手續費及稅額（含零費用）</label>
                {historyEdit.original.category === "美股" && <label className="block">交易日匯率（1 USD = TWD，選填）<Input type="number" min="0" step="any" value={Number.isNaN(historyEdit.draft.fxRate) ? "" : historyEdit.draft.fxRate ?? ""} onChange={event => setHistoryEdit({...historyEdit,draft:{...historyEdit.draft,fxRate:event.target.value === "" ? undefined : Number(event.target.value)}})} /></label>}
                <p>股息金額請填扣費稅前金額；費用與稅額填實際扣款。尚未核對的舊紀錄會標示為估算。</p>
              </div>
              <label className="col-span-2 space-y-1 text-sm">交易日期<Input type="date" max={localDateString()} value={historyEdit.draft.date} onChange={event => setHistoryEdit({...historyEdit, draft:{...historyEdit.draft, date:event.target.value}})} /></label>
              {(historyEdit.original.type === "DIVIDEND" ? ["amount", "fee", "tax"] as const : ["shares", "price", "fee", "tax"] as const).map(field => <label key={field} className="space-y-1 text-sm">
                {{shares:"數量",price:"成交價",amount:"股息金額",fee:"手續費",tax:"稅額"}[field]}
                <Input type="number" min="0" step="any" value={Number.isNaN(historyEdit.draft[field]) ? "" : historyEdit.draft[field] ?? 0} onChange={event => setHistoryEdit({...historyEdit,draft:{...historyEdit.draft,[field]:event.target.value === "" ? NaN : Number(event.target.value),costsVerified:false}})} />
              </label>)}
              <label className="col-span-2 space-y-1 text-sm">備註<Input value={historyEdit.draft.note ?? ""} onChange={event => setHistoryEdit({...historyEdit,draft:{...historyEdit.draft,note:event.target.value}})} /></label>
            </div>}
            <div className="space-y-2 rounded-xl border border-border p-4 text-sm" aria-live="polite">
              <p className="font-bold">確認前影響預覽</p>
              {historyImpact?.error ? <p role="alert" className="text-destructive">{historyImpact.error}</p> : <>
                <p>交易筆數：{transactions.length} → {historyImpact?.transactions.length}</p>
                {historyImpact?.before && historyImpact.after ? <>
                  <p>持股數量：{historyImpact.before.shares.toLocaleString()} → {historyImpact.after.shares.toLocaleString()}</p>
                  <p>平均成本：{historyImpact.before.avgPrice} → {historyImpact.after.avgPrice}</p>
                  <p>持股成本：{formatNativeMoney(historyImpact.before.shares * historyImpact.before.avgPrice, historyEdit.original.category)} → {formatNativeMoney(historyImpact.after.shares * historyImpact.after.avgPrice, historyEdit.original.category)}</p>
                </> : <p>股息紀錄變更不改動持股；股息統計將同步更新。</p>}
              </>}
              <p className="text-muted-foreground">買賣紀錄會依日期重算加權平均成本（不含費用／稅額），現價與行情時間保留。費用與稅額請自行核對，修改成交金額不會自動重估費用。</p>
              <p>確認後先保存操作前快照，再儲存交易及持股；可由備份下載快照復原。</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setHistoryEdit(null)}>取消</Button>
              <Button variant={historyEdit.deleting ? "destructive" : "default"} disabled={!storageReady || Boolean(historyImpact?.error)} onClick={confirmHistoryChange}>{historyEdit.deleting ? "確認刪除並重算" : "確認儲存並重算"}</Button>
            </DialogFooter>
          </>}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pendingRestore)}
        onOpenChange={(open) => {
          if (!open) setPendingRestore(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認還原這份備份？</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                「{pendingRestore?.fileName}」包含 {pendingRestore?.data.holdings.length ?? 0} 筆持股與 {pendingRestore?.data.transactions.length ?? 0} 筆交易。
              </span>
              <span className="block">
                備份時間：{formatBackupDate(pendingRestore?.exportedAt ?? null)}。還原會覆蓋目前資料；系統會先保存還原前復原快照，保存失敗則停止。仍建議先匯出外部備份。
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={(event) => { event.preventDefault(); confirmRestore(); }}>
              確認覆蓋並還原
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>移除「{pendingDelete?.name}」持股？</AlertDialogTitle>
            <AlertDialogDescription>
              持股會從資產統計中移除，但既有交易履歷會保留，方便日後查核。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDeleteHolding}>
              確認移除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
