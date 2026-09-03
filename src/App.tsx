import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle as TriangleAlert,
  BarChart3,
  BookOpenCheck,
  Cable,
  Check,
  CircleDollarSign,
  Download,
  Gauge,
  Pause,
  Play,
  RefreshCw,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import type { BrokerConfig, EngineConfig, EngineState } from "./engine/types";
import { fmtP, fmtUSD } from "./engine/types";
import {
  DEFAULT_CFG,
  advance,
  computeStats,
  createEngine,
  createLiveEngine,
  decideQueue,
  feedLiveBar,
  simulationSpec,
  approvalBlock,
  refreshTelemetry,
} from "./engine/engine";
import { connectMt5Feed, fetchMt5Bars } from "./engine/liveFeed";
import {
  dispatchTradeOrder,
  fetchBrokerSymbolSpec,
  fetchMt5NewsStatus,
  fetchBrokerSnapshot,
  loadBrokerConfig,
  saveBrokerConfig,
  type BrokerSnapshot,
} from "./engine/brokerDispatch";
import {
  exportJournalToCsv,
  initAutoprune,
  loadAllJournalTrades,
  saveTradeToJournal,
} from "./engine/storage";
import BrokerSettingsModal from "./components/BrokerSettingsModal";
import LifecyclePanel from "./components/LifecyclePanel";
import type { OperatorAction, OperatorResult } from "./engine/lifecycle";
import { ToastProvider, useToast } from "./components/Toast";
import { restorePaperSession, savePaperSession } from "./engine/paperSession";
import { loadPreferences, savePreferences } from "./engine/preferences";
import { secureRandomInt } from "./utils/crypto";

type View = "overview" | "risk" | "journal" | "system";

function Card({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-white/[0.08] bg-[#101318]/90 shadow-[0_20px_70px_rgba(0,0,0,.25)] ${className}`}
    >
      <header className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3 text-[11px] font-bold uppercase tracking-[.16em] text-slate-400">
        {icon}
        {title}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Metric({
  label,
  value,
  tone = "text-white",
  sub,
}: {
  label: string;
  value: string;
  tone?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
      <div className="text-[9px] font-bold uppercase tracking-[.14em] text-slate-500">
        {label}
      </div>
      <div className={`mt-1 font-mono text-lg font-black ${tone}`}>{value}</div>
      {sub && <div className="mt-1 text-[9px] text-slate-500">{sub}</div>}
    </div>
  );
}

function PriceChart({ st, digits }: { st: EngineState; digits: number }) {
  const bars = st.bars.slice(-110);
  if (bars.length < 2)
    return (
      <div className="h-60 grid place-items-center text-slate-500">
        Waiting for bars…
      </div>
    );
  const min = Math.min(...bars.map((b) => b.l)),
    max = Math.max(...bars.map((b) => b.h)),
    span = Math.max(max - min, 1e-9);
  const points = bars
    .map(
      (bar, i) =>
        `${(i / (bars.length - 1)) * 1000},${220 - ((bar.c - min) / span) * 190}`,
    )
    .join(" ");
  const latest = bars[bars.length - 1];
  return (
    <div>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <div className="text-3xl font-black text-white">
            {fmtP(latest.c, digits)}
          </div>
          <div className="text-[10px] text-slate-500">
            Latest broker/simulation close
          </div>
        </div>
        <div className="text-right text-[10px] text-slate-500">
          Range
          <br />
          <span className="font-mono text-slate-300">
            {fmtP(min, digits)} — {fmtP(max, digits)}
          </span>
        </div>
      </div>
      <svg viewBox="0 0 1000 240" className="h-60 w-full overflow-visible">
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f59e0b" stopOpacity=".28" />
            <stop offset="1" stopColor="#f59e0b" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          points={`0,240 ${points} 1000,240`}
          fill="url(#chartFill)"
          stroke="none"
        />
        <polyline
          points={points}
          fill="none"
          stroke="#fbbf24"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

function ConfigNumber({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex justify-between text-[10px] font-semibold text-slate-400">
        <span>{label}</span>
        <span className="text-amber-300">{suffix}</span>
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) =>
          onChange(Math.min(max, Math.max(min, Number(event.target.value))))
        }
        className="w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 font-mono text-xs font-bold text-white outline-none focus:border-amber-400/60"
      />
    </label>
  );
}

function ControlCenter() {
  const { addToast } = useToast();
  const [cfg, setCfg] = useState<EngineConfig>(loadPreferences);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const [brokerCfg, setBrokerCfg] = useState<BrokerConfig>(loadBrokerConfig);
  const brokerRef = useRef(brokerCfg);
  brokerRef.current = brokerCfg;
  const [stRef] = useState(() => ({
    current: restorePaperSession(secureRandomInt(1, 999999), cfg),
  }));
  const [tick, setTick] = useState(0);
  const [running, setRunning] = useState(true);
  const runningRef = useRef(running);
  runningRef.current = running;
  const [view, setView] = useState<View>("overview");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [newsAvailable, setNewsAvailable] = useState(false);
  const [snapshot, setSnapshot] = useState<BrokerSnapshot | null>(null);
  const [recoveryRevision, setRecoveryRevision] = useState(0);
  const submissionLock = useRef(false);
  const connectionGeneration = useRef(0);
  const [journal, setJournal] = useState(loadAllJournalTrades);
  const refreshJournal = () => setJournal(loadAllJournalTrades());
  useEffect(() => {
    savePreferences(cfg);
    refreshTelemetry(stRef.current, cfg);
    setTick((n) => n + 1);
  }, [cfg]);

  const applySnapshot = (data: BrokerSnapshot, state: EngineState) => {
    state.balance = data.balance;
    state.equity = data.equity;
    state.peakEquity = data.peak_equity;
    state.dayStartBalance = data.day_start_balance;
    state.dailyTrades = data.daily_trades;
    state.dailyLoss = data.daily_loss;
    state.drawdownPercent = data.drawdown_percent;
    state.halted =
      data.halted || data.positions.length > 0 || data.pending_orders > 0;
    state.haltReason =
      data.halt_reason ||
      (data.positions.length || data.pending_orders
        ? "Broker account has an open position/order"
        : undefined);
    setSnapshot(data);
  };

  useEffect(() => {
    initAutoprune();
  }, []);
  const patchCfg = useCallback(
    (patch: Partial<EngineConfig>) =>
      setCfg((current) => ({ ...current, ...patch })),
    [],
  );
  const patchSafe = useCallback(
    (patch: Partial<EngineConfig["safe"]>) =>
      setCfg((current) => ({
        ...current,
        safe: { ...current.safe, ...patch },
      })),
    [],
  );

  useEffect(() => {
    if (!running || cfg.feedMode !== "simulated") return;
    const timer = window.setInterval(() => {
      const st = stRef.current;
      const beforeClosed = st.trades.length;
      const beforeQueue = st.queue.filter((q) => q.status === "PENDING").length;
      advance(st, cfgRef.current);
      savePaperSession(st, cfgRef.current);
      if (st.trades.length > beforeClosed) {
        saveTradeToJournal(st.trades[0], cfgRef.current.activeSymbol, "DEMO");
        refreshJournal();
      }
      if (st.queue.filter((q) => q.status === "PENDING").length > beforeQueue)
        addToast({
          title: "Seven gates aligned",
          description: "Signal is held for supervised review.",
          type: "signal",
        });
      setTick((value) => value + 1);
    }, 750);
    return () => window.clearInterval(timer);
  }, [running, cfg.feedMode, addToast]);

  useEffect(() => {
    if (cfg.feedMode !== "mt5") return;
    return connectMt5Feed(
      brokerCfg.mt5Url,
      brokerCfg.mt5Secret,
      cfg.activeSymbol,
      cfg.timeframe,
      {
        onBar: (bar, closed) => {
          feedLiveBar(
            stRef.current,
            cfgRef.current,
            bar,
            closed,
            runningRef.current,
          );
          setTick((value) => value + 1);
        },
        onStatus: (status, latency) => {
          stRef.current.feedStatus = status;
          stRef.current.feedLatency = latency;
          setTick((value) => value + 1);
        },
      },
      stRef.current.bars[stRef.current.bars.length - 1]?.t ?? 0,
    );
  }, [
    cfg.feedMode,
    cfg.activeSymbol,
    cfg.timeframe,
    brokerCfg.mt5Url,
    brokerCfg.mt5Secret,
  ]);

  useEffect(() => {
    if (cfg.feedMode !== "mt5") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      const state = stRef.current;
      try {
        const [spec, news, account] = await Promise.all([
          fetchBrokerSymbolSpec(
            brokerCfg.mt5Url,
            brokerCfg.mt5Secret,
            cfgRef.current.activeSymbol,
          ),
          fetchMt5NewsStatus(brokerCfg.mt5Url, brokerCfg.mt5Secret),
          fetchBrokerSnapshot(brokerCfg.mt5Url, brokerCfg.mt5Secret),
        ]);
        if (cancelled || state !== stRef.current) return;
        if (
          account.account_id !== cfgRef.current.brokerSpec.accountId ||
          spec.accountId !== account.account_id
        )
          throw new Error("Broker account changed — reconnect");
        applySnapshot(account, state);
        setNewsAvailable(news.available);
        setCfg((c) => ({
          ...c,
          brokerSpec: spec,
          newsLocked: !news.available || news.locked,
          newsLabel: news.label,
        }));
      } catch (error) {
        if (!cancelled) {
          state.halted = true;
          state.haltReason =
            error instanceof Error ? error.message : "Broker preflight failed";
          setNewsAvailable(false);
          setCfg((c) => ({
            ...c,
            newsLocked: true,
            newsLabel: "Account/news refresh failed — execution paused",
            brokerSpec: { ...c.brokerSpec, ready: false },
          }));
        }
      } finally {
        if (!cancelled) timer = setTimeout(refresh, 10_000);
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cfg.feedMode, brokerCfg.mt5Url, brokerCfg.mt5Secret, recoveryRevision]);

  const onReconciled = (action: OperatorAction, result: OperatorResult) => {
    if (
      cfgRef.current.feedMode !== "mt5" ||
      cfgRef.current.brokerSpec.accountId !== action.account_id
    )
      return;
    const state = stRef.current;
    if (action.kind === "ENTRY") {
      const item = state.queue.find(
        (q) => q.signalId === action.entity && q.source === "mt5",
      );
      if (item && ["SENDING", "UNKNOWN"].includes(item.dispatchStatus ?? "")) {
        item.status = result.status === "FILLED" ? "APPROVED" : "REJECTED";
        item.dispatchStatus = result.status === "FILLED" ? "SENT" : "FAILED";
        item.dispatchMsg = `Operator evidence review: ${result.status}`;
        if (result.status === "FILLED")
          item.brokerTicket = result.evidence?.ticket;
      }
    }
    state.halted = true;
    state.haltReason = "Refreshing authoritative broker state after review";
    setRecoveryRevision((v) => v + 1);
    setTick((v) => v + 1);
  };

  const connectBroker = async () => {
    if (submissionLock.current) return;
    if (cfgRef.current.feedMode === "simulated")
      savePaperSession(stRef.current, cfgRef.current);
    const generation = ++connectionGeneration.current;
    setConnecting(true);
    try {
      const [spec, news, bars, account] = await Promise.all([
        fetchBrokerSymbolSpec(
          brokerCfg.mt5Url,
          brokerCfg.mt5Secret,
          cfg.activeSymbol,
        ),
        fetchMt5NewsStatus(brokerCfg.mt5Url, brokerCfg.mt5Secret),
        fetchMt5Bars(
          brokerCfg.mt5Url,
          brokerCfg.mt5Secret,
          cfg.activeSymbol,
          cfg.timeframe,
          900,
        ),
        fetchBrokerSnapshot(brokerCfg.mt5Url, brokerCfg.mt5Secret),
      ]);
      if (generation !== connectionGeneration.current) return;
      if (spec.accountId !== account.account_id)
        throw new Error("Inconsistent broker account — reconnect");
      const nextCfg: EngineConfig = {
        ...cfgRef.current,
        accountBalance: spec.balance,
        brokerSpec: spec,
        feedMode: "mt5",
        executionMode: "supervised",
        newsLocked: !news.available || news.locked,
        newsLabel: news.label,
      };
      // Refreshing the same connection must not erase pending/unknown submissions.
      if (
        cfgRef.current.feedMode !== "mt5" ||
        cfgRef.current.brokerSpec.accountId !== account.account_id
      )
        stRef.current = createLiveEngine(bars, nextCfg);
      applySnapshot(account, stRef.current);
      cfgRef.current = nextCfg;
      setNewsAvailable(news.available);
      setCfg(nextCfg);
      setTick((v) => v + 1);
      addToast({
        title:
          spec.source === "MOCK"
            ? "Synthetic MOCK connected — orders blocked"
            : "MT5 monitoring connected",
        description:
          spec.symbol +
          " · " +
          spec.accountMode +
          " · real-account orders locked",
        type: "info",
      });
    } catch (error) {
      addToast({
        title: "MT5 connection failed",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
    } finally {
      setConnecting(false);
    }
  };

  const switchToSimulation = () => {
    if (submissionLock.current) return;
    connectionGeneration.current++;
    if (cfgRef.current.feedMode === "simulated")
      savePaperSession(stRef.current, cfgRef.current);
    const spec = simulationSpec(cfg.activeSymbol, DEFAULT_CFG.accountBalance);
    const next = {
      ...cfg,
      accountBalance: DEFAULT_CFG.accountBalance,
      feedMode: "simulated" as const,
      brokerSpec: spec,
      newsLocked: false,
      executionMode: "supervised" as const,
    };
    setSnapshot(null);
    setCfg(next);
    cfgRef.current = next;
    stRef.current = restorePaperSession(secureRandomInt(1, 999999), next);
    setTick((v) => v + 1);
  };

  const decide = async (id: number, approve: boolean) => {
    if (submissionLock.current) return;
    if (approve && !runningRef.current) {
      addToast({
        title: "Entries paused",
        description: "Resume before approving a signal.",
        type: "warning",
      });
      return;
    }
    const state = stRef.current;
    const q = state.queue.find(
      (item) => item.id === id && item.status === "PENDING",
    );
    if (!q) return;
    if (!approve || cfgRef.current.feedMode === "simulated") {
      const trade = decideQueue(state, id, approve, cfgRef.current);
      if (trade) {
        saveTradeToJournal(trade, cfgRef.current.activeSymbol, "DEMO");
        refreshJournal();
      }
      if (approve && !trade)
        addToast({
          title: "Approval blocked",
          description: q.reason,
          type: "warning",
        });
      savePaperSession(state, cfgRef.current);
      setTick((v) => v + 1);
      return;
    }
    submissionLock.current = true;
    try {
      const [spec, news, account] = await Promise.all([
        fetchBrokerSymbolSpec(
          brokerRef.current.mt5Url,
          brokerRef.current.mt5Secret,
          cfgRef.current.activeSymbol,
        ),
        fetchMt5NewsStatus(
          brokerRef.current.mt5Url,
          brokerRef.current.mt5Secret,
        ),
        fetchBrokerSnapshot(
          brokerRef.current.mt5Url,
          brokerRef.current.mt5Secret,
        ),
      ]);
      if (
        state !== stRef.current ||
        spec.accountId !== cfgRef.current.brokerSpec.accountId ||
        spec.accountId !== account.account_id
      )
        throw new Error("Account/session changed");
      applySnapshot(account, state);
      const next = {
        ...cfgRef.current,
        brokerSpec: spec,
        newsLocked: !news.available || news.locked,
        newsLabel: news.label,
      };
      cfgRef.current = next;
      setCfg(next);
      setNewsAvailable(news.available);
      const reason = approvalBlock(state, next, q);
      if (reason) throw new Error(reason);
      q.dispatchStatus = "SENDING";
      setTick((v) => v + 1);
      const result = await dispatchTradeOrder(q, brokerRef.current, next);
      q.dispatchStatus = result.success
        ? "SENT"
        : result.unknown
          ? "UNKNOWN"
          : "FAILED";
      q.dispatchMsg = result.message;
      if (result.receipt) {
        q.status = "APPROVED";
        q.brokerTicket = result.receipt.ticket;
        // No local open/fill or candle-driven exit in MT5 mode. Broker snapshots
        // are the sole authority for positions, deals and account P/L.
      } else if (!result.unknown) {
        q.status = "REJECTED";
        q.reason = result.message;
      }
      if (result.unknown) {
        state.halted = true;
        state.haltReason = result.message;
      }
      addToast({
        title: result.success
          ? "DEMO broker receipt confirmed"
          : "Broker order not confirmed",
        description: result.message,
        type: result.success ? "success" : "error",
      });
    } catch (error) {
      q.reason =
        error instanceof Error ? error.message : "Approval preflight failed";
      addToast({
        title: "Approval blocked",
        description: q.reason,
        type: "error",
      });
    } finally {
      submissionLock.current = false;
      setTick((v) => v + 1);
    }
  };

  const st = stRef.current;
  const stats = useMemo(
    () => computeStats({ ...st, trades: journal }),
    [st, tick, journal],
  );
  const risk = st.telemetry.risk;
  const pending = st.queue.filter((q) => q.status === "PENDING");
  const brokerChecks = [
    {
      label: "Contract profile",
      ok: cfg.brokerSpec.ready,
      value: `${cfg.brokerSpec.digits} digits · ${cfg.brokerSpec.point} point`,
    },
    {
      label: "Minimum volume",
      ok: risk.allowed,
      value: `${cfg.brokerSpec.volumeMin} / step ${cfg.brokerSpec.volumeStep}`,
    },
    {
      label: "Stops + freeze",
      ok:
        risk.effectiveStopPoints >=
        Math.max(cfg.brokerSpec.stopsLevel, cfg.brokerSpec.freezeLevel) +
          cfg.safe.stopBufferPoints,
      value: `${cfg.brokerSpec.stopsLevel}/${cfg.brokerSpec.freezeLevel}p + buffer`,
    },
    {
      label: "Native news guard",
      ok: cfg.feedMode === "simulated" || newsAvailable,
      value:
        cfg.feedMode === "simulated"
          ? "Demo bypass"
          : newsAvailable
            ? cfg.newsLocked
              ? "LOCKED"
              : "Clear"
            : "Unavailable",
    },
  ];
  const statusReason = !running
    ? "Entries paused"
    : cfg.feedMode === "mt5" && !cfg.brokerSpec.executionEnabled
      ? "Monitoring only — execution locked"
      : st.telemetry.blockedBy;
  const accountMoney = (v: number) =>
    cfg.feedMode === "mt5"
      ? `${cfg.brokerSpec.currency} ${v.toFixed(2)}`
      : fmtUSD(v);
  const readiness = brokerChecks.filter((item) => item.ok).length;

  return (
    <div className="min-h-screen bg-[#080a0e] text-slate-200">
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#0b0e13]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-600 font-black text-black shadow-lg shadow-amber-500/10">
              SS
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-black tracking-wide text-white">
                  SAFE SCALPER CONTROL
                </h1>
                <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-300">
                  SINGLE STRATEGY
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-500">
                <span>
                  {cfg.activeSymbol} · {cfg.timeframe.toUpperCase()}
                </span>
                <span>•</span>
                <span
                  className={
                    cfg.feedMode === "mt5"
                      ? "text-emerald-400"
                      : "text-amber-300"
                  }
                >
                  {cfg.feedMode === "mt5"
                    ? `${cfg.brokerSpec.source} ${st.feedStatus.toUpperCase()}`
                    : "SIMULATION"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              aria-label={running ? "Pause entries" : "Resume entries"}
              onClick={() => setRunning((value) => !value)}
              className="rounded-lg border border-white/10 bg-white/[0.04] p-2 text-slate-300 hover:bg-white/10"
            >
              {running ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button
              onClick={
                cfg.feedMode === "mt5" ? switchToSimulation : connectBroker
              }
              disabled={connecting}
              className="flex items-center gap-2 rounded-lg bg-amber-400 px-3 py-2 text-[10px] font-black text-black hover:bg-amber-300 disabled:opacity-50"
            >
              {connecting ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Cable size={14} />
              )}{" "}
              {cfg.feedMode === "mt5" ? "PAPER MODE" : "CONNECT MT5"}
            </button>
            <button
              aria-label="Broker settings"
              onClick={() => setSettingsOpen(true)}
              className="rounded-lg border border-white/10 bg-white/[0.04] p-2 text-slate-300"
            >
              <Settings size={16} />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] grid-cols-1 lg:grid-cols-[220px_1fr]">
        <aside className="border-b border-white/[0.07] p-3 lg:min-h-[calc(100vh-65px)] lg:border-b-0 lg:border-r">
          <nav className="grid grid-cols-4 gap-1 lg:grid-cols-1">
            {(
              [
                {
                  id: "overview",
                  label: "Control Center",
                  icon: <Activity size={15} />,
                },
                {
                  id: "risk",
                  label: "Small Account",
                  icon: <ShieldCheck size={15} />,
                },
                {
                  id: "journal",
                  label: "Journal",
                  icon: <BarChart3 size={15} />,
                },
                {
                  id: "system",
                  label: "Broker System",
                  icon: <BookOpenCheck size={15} />,
                },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                aria-label={item.label}
                onClick={() => setView(item.id)}
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[10px] font-bold lg:justify-start ${view === item.id ? "bg-amber-400 text-black" : "text-slate-500 hover:bg-white/[0.04] hover:text-white"}`}
              >
                {item.icon}
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="mt-6 hidden rounded-xl border border-white/[0.06] bg-black/20 p-3 lg:block">
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
              Safety status
            </div>
            <div
              className={`mt-2 text-xs font-black ${st.halted || statusReason ? "text-amber-300" : "text-emerald-400"}`}
            >
              {st.halted
                ? `HALTED · ${st.haltReason}`
                : (statusReason ?? "ARMED")}
            </div>
            <div className="mt-3 h-1.5 rounded bg-white/5">
              <div
                className="h-full rounded bg-emerald-400"
                style={{ width: `${(readiness / brokerChecks.length) * 100}%` }}
              />
            </div>
            <div className="mt-1.5 text-[9px] text-slate-600">
              Contract checks {readiness}/{brokerChecks.length}
            </div>
          </div>
        </aside>

        <main className="min-w-0 p-4 lg:p-6">
          <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/[.04] p-3 text-xs leading-relaxed text-amber-200">
            {cfg.feedMode === "simulated"
              ? "PAPER SIMULATION · Synthetic prices. No broker orders are sent."
              : cfg.brokerSpec.source === "MOCK"
                ? "SYNTHETIC MOCK · Not a real MT5 connection. All orders are blocked."
                : cfg.brokerSpec.executionEnabled
                  ? "MT5 DEMO · Supervised entries. Broker SL/TP + host-managed breakeven, trailing and partial exits. Check worker status in System."
                  : "MT5 MONITOR ONLY · Real-account execution is locked. Broker validation and demo forward testing remain required."}
          </div>
          {(st.open || (snapshot && cfg.feedMode === "mt5")) && (
            <Card
              title={
                cfg.feedMode === "mt5"
                  ? "Authoritative broker positions"
                  : "Active paper position"
              }
              className="mb-4"
            >
              {cfg.feedMode === "mt5" ? (
                <div className="space-y-2 text-xs">
                  <p className="text-slate-500">
                    Account {snapshot?.account_id} · Last snapshot{" "}
                    {snapshot
                      ? new Date(snapshot.checked_at).toLocaleTimeString()
                      : "—"}{" "}
                    · No candle-simulated broker exits.
                  </p>
                  {snapshot?.positions.length ? (
                    snapshot.positions.map((p) => (
                      <div
                        key={p.ticket}
                        className="rounded-lg bg-black/20 p-3 font-mono"
                      >
                        #{p.ticket} · {p.symbol} ·{" "}
                        {p.type === 0 ? "BUY" : "SELL"} · {p.volume} lots · SL{" "}
                        {p.sl || "NONE"} · TP {p.tp || "NONE"} · P/L{" "}
                        {p.profit.toFixed(2)}
                      </div>
                    ))
                  ) : (
                    <p>No open broker positions in the latest snapshot.</p>
                  )}
                </div>
              ) : (
                st.open && (
                  <div className="font-mono text-xs">
                    {st.open.side} · {st.open.brokerLots} lots · Entry{" "}
                    {fmtP(st.open.entry)} · SL {fmtP(st.open.sl)} · TP{" "}
                    {fmtP(st.open.tp)} ·{" "}
                    {st.open.trailActive
                      ? "Trailing"
                      : st.open.isBreakeven
                        ? "Breakeven"
                        : "Protected"}
                  </div>
                )
              )}
            </Card>
          )}
          {view === "overview" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
                <Metric
                  label="Equity"
                  value={
                    cfg.feedMode === "mt5"
                      ? `${cfg.brokerSpec.currency} ${st.equity.toFixed(2)}`
                      : fmtUSD(st.equity)
                  }
                  tone="text-emerald-300"
                />
                <Metric
                  label="Risk / trade"
                  value={`${cfg.safe.riskPercent.toFixed(2)}%`}
                  sub={`${accountMoney(risk.riskBudget)} budget`}
                />
                <Metric
                  label="Calculated lot"
                  value={risk.lots ? risk.lots.toFixed(2) : "BLOCK"}
                  tone={risk.allowed ? "text-white" : "text-rose-400"}
                />
                <Metric
                  label="Daily trades"
                  value={`${st.dailyTrades}/${cfg.safe.maxDailyTrades}`}
                />
                <Metric
                  label="Drawdown"
                  value={`${st.drawdownPercent.toFixed(2)}%`}
                  tone={
                    st.drawdownPercent >= 3 ? "text-amber-300" : "text-white"
                  }
                />
                <Metric
                  label="Signal"
                  value={st.telemetry.side}
                  tone={
                    st.telemetry.side === "LONG"
                      ? "text-emerald-400"
                      : st.telemetry.side === "SHORT"
                        ? "text-rose-400"
                        : "text-slate-400"
                  }
                />
              </div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_.65fr]">
                <Card title="Broker-price chart" icon={<Activity size={14} />}>
                  <PriceChart st={st} digits={cfg.brokerSpec.digits} />
                </Card>
                <Card
                  title="Seven mandatory gates"
                  icon={<ShieldCheck size={14} />}
                >
                  <div className="space-y-2">
                    {st.telemetry.gates.length ? (
                      st.telemetry.gates.map((gate, i) => (
                        <div
                          key={gate.key}
                          className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-black/20 p-2.5"
                        >
                          <div
                            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${gate.passed ? "bg-emerald-500/15 text-emerald-400" : "bg-white/[0.04] text-slate-600"}`}
                          >
                            {gate.passed ? (
                              <Check size={13} />
                            ) : (
                              <X size={13} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] font-bold text-slate-200">
                              {i + 1}. {gate.label}
                            </div>
                            <div className="truncate font-mono text-[9px] text-slate-500">
                              {gate.detail}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-slate-500">
                        Indicators are warming.
                      </div>
                    )}
                  </div>
                </Card>
              </div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <Card title="Action queue" icon={<Gauge size={14} />}>
                  {pending.length ? (
                    pending.map((signal) => (
                      <div
                        key={signal.id}
                        className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4"
                      >
                        <div className="flex justify-between">
                          <div>
                            <div className="text-xs font-black text-white">
                              {signal.side} · Seven gates confirmed
                            </div>
                            <div className="mt-1 font-mono text-[10px] text-slate-400">
                              {signal.brokerLots.toFixed(2)} lots · risk{" "}
                              {accountMoney(signal.risk)} · SL{" "}
                              {fmtP(signal.sl, cfg.brokerSpec.digits)}
                            </div>
                          </div>
                          <span className="text-[9px] text-amber-300">
                            3-BAR TTL
                          </span>
                        </div>
                        <div className="mt-4 flex gap-2">
                          <button
                            disabled={
                              signal.dispatchStatus === "SENDING" ||
                              signal.dispatchStatus === "UNKNOWN" ||
                              (cfg.feedMode === "mt5" &&
                                !cfg.brokerSpec.executionEnabled)
                            }
                            onClick={() => void decide(signal.id, true)}
                            className="flex-1 rounded-lg disabled:opacity-40 bg-emerald-500 py-2 text-[10px] font-black text-black"
                          >
                            {signal.dispatchStatus === "UNKNOWN"
                              ? "CHECK MT5 — UNKNOWN"
                              : signal.dispatchStatus === "SENDING"
                                ? "SENDING…"
                                : cfg.feedMode === "simulated"
                                  ? "APPROVE PAPER"
                                  : "APPROVE DEMO"}
                          </button>
                          <button
                            disabled={
                              signal.dispatchStatus === "SENDING" ||
                              signal.dispatchStatus === "UNKNOWN"
                            }
                            onClick={() => void decide(signal.id, false)}
                            className="flex-1 rounded-lg disabled:opacity-40 bg-rose-500/15 py-2 text-[10px] font-black text-rose-300"
                          >
                            REJECT
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="grid h-28 place-items-center rounded-xl border border-dashed border-white/10 text-center text-[10px] text-slate-500">
                      <div>
                        <ShieldCheck className="mx-auto mb-2" size={20} />
                        No queued setup. The engine waits for all seven gates.
                      </div>
                    </div>
                  )}
                </Card>
                <Card
                  title="Why trading is blocked"
                  icon={<TriangleAlert size={14} />}
                >
                  <div
                    className={`rounded-xl border p-4 ${statusReason ? "border-amber-400/20 bg-amber-400/[0.04]" : "border-emerald-400/20 bg-emerald-400/[0.04]"}`}
                  >
                    <div
                      className={`text-xs font-black ${statusReason ? "text-amber-300" : "text-emerald-300"}`}
                    >
                      {statusReason ?? "All safety filters clear"}
                    </div>
                    <div className="mt-2 text-[10px] leading-relaxed text-slate-500">
                      {risk.reason}. Expected SL loss{" "}
                      {accountMoney(risk.expectedLoss)}; estimated margin{" "}
                      {accountMoney(risk.marginRequired)}.
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {view === "risk" && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_.8fr]">
              <Card
                title="Small-account guardrails"
                icon={<ShieldCheck size={14} />}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <ConfigNumber
                    label="Risk per trade"
                    value={cfg.safe.riskPercent}
                    min={0.1}
                    max={1}
                    step={0.1}
                    suffix="Recommended 0.5%"
                    onChange={(riskPercent) => patchSafe({ riskPercent })}
                  />
                  <ConfigNumber
                    label="Daily loss limit"
                    value={cfg.safe.dailyLossPercent}
                    min={0.5}
                    max={1.5}
                    step={0.1}
                    suffix="Recommended 1.5%"
                    onChange={(dailyLossPercent) =>
                      patchSafe({ dailyLossPercent })
                    }
                  />
                  <ConfigNumber
                    label="Maximum drawdown"
                    value={cfg.safe.maxDrawdownPercent}
                    min={2}
                    max={5}
                    step={0.5}
                    suffix="Hard pause"
                    onChange={(maxDrawdownPercent) =>
                      patchSafe({ maxDrawdownPercent })
                    }
                  />
                  <ConfigNumber
                    label="Daily trade cap"
                    value={cfg.safe.maxDailyTrades}
                    min={1}
                    max={2}
                    suffix="Maximum 2"
                    onChange={(maxDailyTrades) => patchSafe({ maxDailyTrades })}
                  />
                  <ConfigNumber
                    label="Maximum margin use"
                    value={cfg.safe.maxMarginPercent}
                    min={5}
                    max={25}
                    suffix="% equity"
                    onChange={(maxMarginPercent) =>
                      patchSafe({ maxMarginPercent })
                    }
                  />
                  <ConfigNumber
                    label="Spread / stop cap"
                    value={cfg.safe.maxSpreadToStopPercent}
                    min={5}
                    max={12}
                    suffix="%"
                    onChange={(maxSpreadToStopPercent) =>
                      patchSafe({ maxSpreadToStopPercent })
                    }
                  />
                </div>
                <div className="mt-5 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.03] p-4 text-[10px] leading-relaxed text-slate-400">
                  The engine never rounds an undersized risk calculation up to
                  the broker minimum lot. If 0.01 lot is too large for the
                  selected risk budget, the trade is rejected.
                </div>
              </Card>
              <Card
                title="Execution geometry"
                icon={<CircleDollarSign size={14} />}
              >
                <div className="grid gap-4">
                  <ConfigNumber
                    label="Stop loss points"
                    value={cfg.safe.stopLossPoints}
                    min={50}
                    max={2000}
                    suffix="3-digit calibration"
                    onChange={(stopLossPoints) => patchSafe({ stopLossPoints })}
                  />
                  <ConfigNumber
                    label="Take profit points"
                    value={cfg.safe.takeProfitPoints}
                    min={50}
                    max={3000}
                    suffix="3-digit calibration"
                    onChange={(takeProfitPoints) =>
                      patchSafe({ takeProfitPoints })
                    }
                  />
                  <ConfigNumber
                    label="Absolute spread cap"
                    value={cfg.safe.maxSpreadPoints}
                    min={5}
                    max={50}
                    suffix="broker points"
                    onChange={(maxSpreadPoints) =>
                      patchSafe({ maxSpreadPoints })
                    }
                  />
                  <div className="rounded-xl bg-black/20 p-4 font-mono text-[10px] text-slate-400">
                    <div className="flex justify-between">
                      <span>Effective stop</span>
                      <span className="text-white">
                        {risk.effectiveStopPoints.toFixed(0)}p
                      </span>
                    </div>
                    <div className="mt-2 flex justify-between">
                      <span>Effective target</span>
                      <span className="text-white">
                        {risk.effectiveTakeProfitPoints.toFixed(0)}p
                      </span>
                    </div>
                    <div className="mt-2 flex justify-between">
                      <span>Expected loss</span>
                      <span
                        className={
                          risk.allowed ? "text-emerald-300" : "text-rose-300"
                        }
                      >
                        {accountMoney(risk.expectedLoss)}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {view === "journal" && snapshot && cfg.feedMode === "mt5" && (
            <Card
              title="Today's broker deals · account-wide, including fees"
              className="mb-4"
            >
              <div className="space-y-2 text-xs">
                {snapshot.deals.length ? (
                  [...snapshot.deals].reverse().map((deal) => (
                    <div
                      className="rounded-lg bg-black/20 p-3 font-mono"
                      key={deal.ticket}
                    >
                      #{deal.ticket} · {deal.symbol} ·{" "}
                      {new Date(deal.time * 1000).toISOString().slice(11, 19)}{" "}
                      UTC · {deal.volume} lots · {accountMoney(deal.net)}
                    </div>
                  ))
                ) : (
                  <p>No deals in today's broker history.</p>
                )}
              </div>
            </Card>
          )}
          {view === "journal" && (
            <Card
              title="Saved paper journal · all sessions (not broker P/L)"
              icon={<BarChart3 size={14} />}
            >
              <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
                <Metric label="Closed" value={String(stats.closed)} />
                <Metric
                  label="Win rate"
                  value={`${stats.winRate.toFixed(1)}%`}
                />
                <Metric
                  label="Net P/L"
                  value={fmtUSD(stats.netPnl, true)}
                  tone={
                    stats.netPnl >= 0 ? "text-emerald-300" : "text-rose-300"
                  }
                />
                <Metric
                  label="Profit factor"
                  value={
                    Number.isFinite(stats.profitFactor)
                      ? stats.profitFactor.toFixed(2)
                      : "∞"
                  }
                />
                <button
                  onClick={() =>
                    exportJournalToCsv(loadAllJournalTrades(), cfg.activeSymbol)
                  }
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-[10px] font-bold text-slate-300"
                >
                  <Download size={14} /> EXPORT CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-[10px]">
                  <thead className="border-b border-white/10 text-slate-500">
                    <tr>
                      {[
                        "Time",
                        "Side",
                        "Entry",
                        "SL",
                        "TP",
                        "Lots",
                        "Risk",
                        "P/L",
                        "Outcome",
                      ].map((label) => (
                        <th
                          key={label}
                          className="px-3 py-2 font-bold uppercase"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {journal.length ? (
                      journal.map((trade) => (
                        <tr
                          key={trade.signalId}
                          className="border-b border-white/[0.05]"
                        >
                          <td className="px-3 py-3 font-mono text-slate-500">
                            {new Date(trade.entryTime)
                              .toISOString()
                              .slice(0, 16)
                              .replace("T", " ")}
                          </td>
                          <td
                            className={`px-3 py-3 font-black ${trade.side === "LONG" ? "text-emerald-400" : "text-rose-400"}`}
                          >
                            {trade.side}
                          </td>
                          <td className="px-3 py-3 font-mono">
                            {fmtP(trade.entry, cfg.brokerSpec.digits)}
                          </td>
                          <td className="px-3 py-3 font-mono">
                            {fmtP(trade.sl, cfg.brokerSpec.digits)}
                          </td>
                          <td className="px-3 py-3 font-mono">
                            {fmtP(trade.tp, cfg.brokerSpec.digits)}
                          </td>
                          <td className="px-3 py-3 font-mono">
                            {trade.brokerLots.toFixed(2)}
                          </td>
                          <td className="px-3 py-3 font-mono">
                            {fmtUSD(trade.risk)}
                          </td>
                          <td
                            className={`px-3 py-3 font-mono font-bold ${(trade.pnl ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}
                          >
                            {fmtUSD(trade.pnl ?? 0, true)}
                          </td>
                          <td className="px-3 py-3">
                            {trade.outcome ??
                              (trade.open ? "OPEN · PAPER" : "CLOSED")}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={9}
                          className="py-16 text-center text-slate-500"
                        >
                          No completed SafeScalper trades yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {view === "system" && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Card
                title="Broker compatibility preflight"
                icon={<Cable size={14} />}
              >
                <div className="space-y-2">
                  {brokerChecks.map((check) => (
                    <div
                      key={check.label}
                      className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-black/20 p-3"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`grid h-6 w-6 place-items-center rounded-full ${check.ok ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}
                        >
                          {check.ok ? <Check size={13} /> : <X size={13} />}
                        </span>
                        <span className="text-[10px] font-bold">
                          {check.label}
                        </span>
                      </div>
                      <span className="font-mono text-[9px] text-slate-500">
                        {check.value}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => void connectBroker()}
                  disabled={connecting}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-400 py-2.5 text-[10px] font-black text-black"
                >
                  <RefreshCw
                    size={14}
                    className={connecting ? "animate-spin" : ""}
                  />{" "}
                  REFRESH FROM MT5
                </button>
              </Card>
              <Card
                title="Native broker specification"
                icon={<Gauge size={14} />}
              >
                <dl className="grid grid-cols-2 gap-3 text-[10px]">
                  {[
                    ["Resolved symbol", cfg.brokerSpec.symbol],
                    [
                      "Digits / point",
                      `${cfg.brokerSpec.digits} / ${cfg.brokerSpec.point}`,
                    ],
                    [
                      "Tick size / value",
                      `${cfg.brokerSpec.tickSize} / ${cfg.brokerSpec.tickValue}`,
                    ],
                    ["Contract size", String(cfg.brokerSpec.contractSize)],
                    [
                      "Volume range",
                      `${cfg.brokerSpec.volumeMin} — ${cfg.brokerSpec.volumeMax}`,
                    ],
                    ["Volume step", String(cfg.brokerSpec.volumeStep)],
                    [
                      "Stops / freeze",
                      `${cfg.brokerSpec.stopsLevel} / ${cfg.brokerSpec.freezeLevel}`,
                    ],
                    [
                      "Live spread",
                      `${cfg.brokerSpec.spreadPoints.toFixed(1)} points`,
                    ],
                    ["Free margin", accountMoney(cfg.brokerSpec.freeMargin)],
                    [
                      "100p loss / 1 lot",
                      accountMoney(cfg.brokerSpec.lossPerLot100Points),
                    ],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-black/20 p-3">
                      <dt className="text-slate-600">{label}</dt>
                      <dd className="mt-1 font-mono font-bold text-slate-200">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-3 text-[9px] leading-relaxed text-slate-400">
                  Live mode consumes MT5 broker bars—not Binance/PAXG proxy
                  data. Order dispatch repeats native profit, margin, stop-level
                  and OrderCheck validation before sending.
                </div>
              </Card>
              <Card
                title="Host exits & operator recovery"
                icon={<ShieldCheck size={14} />}
                className="xl:col-span-2"
              >
                <LifecyclePanel
                  url={brokerCfg.mt5Url}
                  secret={brokerCfg.mt5Secret}
                  accountId={cfg.brokerSpec.accountId ?? ""}
                  connected={cfg.feedMode === "mt5"}
                  onReconciled={onReconciled}
                />
              </Card>
              <Card
                title="Engine events"
                icon={<Activity size={14} />}
                className="xl:col-span-2"
              >
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {st.events.map((event) => (
                    <div
                      key={event.id}
                      className="grid grid-cols-[90px_70px_1fr] gap-3 border-b border-white/[0.05] py-2 font-mono text-[9px]"
                    >
                      <span className="text-slate-600">
                        {new Date(event.time).toISOString().slice(11, 19)} UTC
                      </span>
                      <span
                        className={
                          event.tone === "risk"
                            ? "text-rose-400"
                            : event.tone === "long"
                              ? "text-emerald-400"
                              : event.tone === "short"
                                ? "text-rose-300"
                                : "text-amber-300"
                        }
                      >
                        {event.tag}
                      </span>
                      <span className="text-slate-400">{event.msg}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </main>
      </div>
      <BrokerSettingsModal
        key={String(settingsOpen)}
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        config={brokerCfg}
        onSave={(next) => {
          if (submissionLock.current) return;
          setBrokerCfg(next);
          saveBrokerConfig(next);
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <ControlCenter />
    </ToastProvider>
  );
}
