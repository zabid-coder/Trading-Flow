import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BrokerConfig, DashboardView, EngineConfig, EngineState, Timeframe } from "./engine/types";
import {
  DEFAULT_CFG,
  advance,
  computeStats,
  createEngine,
  createLiveEngine,
  decideQueue,
  feedLiveBar,
  moveToBreakeven,
  partialClose,
} from "./engine/engine";
import { connectLiveFeed, fetchHistoricalBars, getSymbolMeta } from "./engine/liveFeed";
import { dispatchTradeOrder, loadBrokerConfig, saveBrokerConfig } from "./engine/brokerDispatch";
import { initAutoprune, saveJournalTrades } from "./engine/storage";
import {
  playBeSound,
  playOrderFilledSound,
  playSignalChime,
  playSlSound,
  playTpSound,
  setAudioMuted,
} from "./utils/audio";
import { ToastProvider, useToast } from "./components/Toast";
import GlobalSidebar from "./components/GlobalSidebar";
import HeaderBar from "./components/HeaderBar";
import CandleChart from "./components/CandleChart";
import PipelineStrip from "./components/PipelineStrip";
import ActionCenter from "./components/ActionCenter";
import ConsolePanel from "./components/ConsolePanel";
import StrategyRadar from "./components/StrategyRadar";
import OrderDesk from "./components/OrderDesk";
import MarketWatchlist from "./components/MarketWatchlist";
import EventFeed from "./components/EventFeed";
import BottomTerminalTabs from "./components/BottomTerminalTabs";
import BrokerSettingsModal from "./components/BrokerSettingsModal";
import StrategyGuideModal from "./components/StrategyGuideModal";
import UniversalOrderModal from "./components/UniversalOrderModal";
import DashboardOverviewView from "./components/DashboardOverviewView";
import TradesLedgerView from "./components/TradesLedgerView";
import AnalysisMatrixView from "./components/AnalysisMatrixView";
import StrategiesConfigView from "./components/StrategiesConfigView";
import ReportsAuditView from "./components/ReportsAuditView";
import VisualAcademyView from "./components/VisualAcademyView";

function TerminalContent() {
  const { addToast } = useToast();
  const [cfg, setCfg] = useState<EngineConfig>(DEFAULT_CFG);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  const [brokerCfg, setBrokerCfg] = useState<BrokerConfig>(loadBrokerConfig);
  const brokerCfgRef = useRef(brokerCfg);
  brokerCfgRef.current = brokerCfg;

  const [brokerModalOpen, setBrokerModalOpen] = useState(false);
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [rightTab, setRightTab] = useState<"signals" | "order" | "strategy" | "risk">("signals");
  const [universalOrderOpen, setUniversalOrderOpen] = useState(false);
  const [universalOrderSide, setUniversalOrderSide] = useState<"LONG" | "SHORT">("LONG");
  const [dashboardView, setDashboardView] = useState<DashboardView>("dashboard");

  const [stRef] = useState(() => ({
    current: createEngine(48271 + Math.floor(Math.random() * 900000), DEFAULT_CFG),
  }));

  const [tick, setTick] = useState(0);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);

  // Sync sound settings
  useEffect(() => {
    setAudioMuted(!cfg.soundEnabled);
  }, [cfg.soundEnabled]);

  // Periodic LocalStorage Journal Auto-Pruning
  useEffect(() => {
    initAutoprune();
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.code === "Space") {
        e.preventDefault();
        setRunning((r) => !r);
        addToast({
          title: running ? "Simulation Paused" : "Simulation Resumed",
          type: "info",
        });
      } else if (e.key === "1") {
        setSpeed(0);
      } else if (e.key === "2") {
        setSpeed(1);
      } else if (e.key === "3") {
        setSpeed(2);
      } else if (e.key === "b" || e.key === "B") {
        setUniversalOrderSide("LONG");
        setUniversalOrderOpen(true);
      } else if (e.key === "s" || e.key === "S") {
        setUniversalOrderSide("SHORT");
        setUniversalOrderOpen(true);
      } else if (e.key === "o" || e.key === "O") {
        setUniversalOrderOpen((prev) => !prev);
      } else if (e.key === "x" || e.key === "X") {
        closeOpenPosition();
      } else if (e.key === "m" || e.key === "M") {
        patchCfg({ soundEnabled: !cfgRef.current.soundEnabled });
        addToast({
          title: cfgRef.current.soundEnabled ? "Audio Muted 🔇" : "Audio Enabled 🔊",
          type: "info",
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [running]);

  // Simulation tick loop
  useEffect(() => {
    if (!running || cfg.feedMode === "live") return;
    const perTick = speed === 3 ? 3 : 1;
    const id = window.setInterval(() => {
      const st = stRef.current;
      if (!st) return;

      const prevTradesCount = st.trades.length;
      const prevPendingCount = st.queue.filter((q) => q.status === "PENDING").length;

      for (let k = 0; k < perTick; k++) advance(st, cfgRef.current);

      // Sound & Toast Cues
      const curPending = st.queue.filter((q) => q.status === "PENDING");
      if (curPending.length > prevPendingCount) {
        playSignalChime();
        addToast({
          title: "⚡ AOI Trap Confirmed",
          description: `${curPending[curPending.length - 1].side} signal in Action Center`,
          type: "signal",
        });
      }

      if (st.trades.length > prevTradesCount) {
        saveJournalTrades(st.trades);
        const lastTrade = st.trades[st.trades.length - 1];
        if (lastTrade.outcome === "TP") {
          playTpSound();
          addToast({
            title: "🎯 Take Profit Filled!",
            description: `+$${(lastTrade.pnl ?? 0).toFixed(0)} (${lastTrade.setup})`,
            type: "success",
          });
        } else if (lastTrade.outcome === "SL") {
          playSlSound();
          addToast({
            title: "🛑 Stop Loss Hit",
            description: `-$${Math.abs(lastTrade.pnl ?? 0).toFixed(0)} (${lastTrade.setup})`,
            type: "error",
          });
        }
      }

      setTick((t) => t + 1);
    }, [1150, 430, 150, 55][speed] ?? 430);

    return () => window.clearInterval(id);
  }, [running, speed, cfg.feedMode]);

  // Live WebSocket feed connection
  useEffect(() => {
    if (cfg.feedMode !== "live") return;

    let cleanupWs: (() => void) | null = null;
    let isCurrent = true;

    async function startLive() {
      const sym = cfg.activeSymbol;
      const tf = cfg.timeframe;
      const meta = getSymbolMeta(sym);
      patchCfg({ pointValue: meta.pointValue, spread: meta.spread });

      const initialBars = await fetchHistoricalBars(sym, tf, 100);
      if (!isCurrent) return;

      stRef.current = createLiveEngine(sym, initialBars, cfgRef.current);
      setTick((t) => t + 1);

      cleanupWs = connectLiveFeed(
        sym,
        (bar) => {
          if (!isCurrent) return;
          const s = stRef.current;
          if (!s) return;

          const prevTrades = s.trades.length;
          feedLiveBar(s, cfgRef.current, bar);

          if (s.trades.length > prevTrades) {
            saveJournalTrades(s.trades);
          }
          setTick((t) => t + 1);
        },
        (status, latency) => {
          if (!isCurrent) return;
          const s = stRef.current;
          if (!s) return;
          s.liveStatus = status;
          s.liveLatency = latency;
          setTick((t) => t + 1);
        }
      );
    }

    startLive();

    return () => {
      isCurrent = false;
      if (cleanupWs) cleanupWs();
    };
  }, [cfg.feedMode, cfg.activeSymbol, cfg.timeframe]);

  const st = stRef.current!;
  const stats = useMemo(() => computeStats(st, cfg), [st, cfg, tick]);

  const patchCfg = (p: Partial<EngineConfig>) => setCfg((c) => ({ ...c, ...p }));
  const patchAoi = (p: Partial<EngineConfig["aoi"]>) => setCfg((c) => ({ ...c, aoi: { ...c.aoi, ...p } }));

  const onDecide = async (id: number, approve: boolean) => {
    const s = stRef.current;
    if (!s) return;

    const item = s.queue.find((q) => q.id === id);
    if (!item) return;

    if (approve) {
      playOrderFilledSound();
      addToast({
        title: "Order Approved",
        description: `${item.side} ${item.oz.toFixed(1)} oz @ ${item.entry.toFixed(2)} dispatched`,
        type: "success",
      });

      if (brokerCfgRef.current.mt5Connected) {
        dispatchTradeOrder(
          {
            symbol: cfgRef.current.activeSymbol,
            side: item.side,
            lots: item.oz,
            entry: item.entry,
            sl: item.sl,
            tp: item.tp,
            magic: 777001,
            comment: `Trading Flow: ${item.setup}`,
          },
          brokerCfgRef.current
        );
      }
    } else {
      addToast({
        title: "Signal Rejected",
        description: `Passed on ${item.side} setup at ${item.setup}`,
        type: "info",
      });
    }

    decideQueue(s, cfgRef.current, id, approve);
    setTick((t) => t + 1);
  };

  const closeOpenPosition = () => {
    const s = stRef.current;
    if (!s || !s.open) return;
    const t = s.open;
    const lastBar = s.bars[s.bars.length - 1];
    const exitPrice = lastBar ? lastBar.c : t.entry;
    const pnl = t.side === "LONG" ? (exitPrice - t.entry) * t.oz : (t.entry - exitPrice) * t.oz;

    t.exit = exitPrice;
    t.exitTime = lastBar ? lastBar.t : Date.now();
    t.pnl = pnl;
    t.outcome = pnl >= 0 ? "TP" : "SL";
    t.open = false;

    s.balance += pnl;
    s.trades.push(t);
    s.open = null;

    saveJournalTrades(s.trades);
    addToast({
      title: "Position Liquidated",
      description: `Closed ${t.side} at market. PnL: $${pnl.toFixed(2)}`,
      type: pnl >= 0 ? "success" : "error",
    });
    setTick((t) => t + 1);
  };

  const handleMoveToBreakeven = () => {
    const s = stRef.current;
    if (!s || !s.open) return;
    moveToBreakeven(s, cfgRef.current);
    playBeSound();
    addToast({
      title: "⚡ Breakeven Set",
      description: `Stop loss adjusted to entry: ${s.open.sl.toFixed(2)}`,
      type: "info",
    });
    setTick((t) => t + 1);
  };

  const handlePartialClose = (ratio: number) => {
    const s = stRef.current;
    if (!s || !s.open) return;
    const closedOz = s.open.oz * ratio;
    partialClose(s, cfgRef.current, ratio);
    addToast({
      title: `💰 Took ${(ratio * 100).toFixed(0)}% Profit`,
      description: `Scaled out ${closedOz.toFixed(2)} units. Stop moved to BE.`,
      type: "success",
    });
    setTick((t) => t + 1);
  };

  const handleExecuteManual = (side: "LONG" | "SHORT", customOz?: number) => {
    const s = stRef.current;
    if (!s) return;
    const lastBar = s.bars[s.bars.length - 1];
    if (!lastBar) return;

    if (s.open) {
      addToast({
        title: "Execution Blocked",
        description: "Position already active. Close current position first.",
        type: "error",
      });
      return;
    }

    const atr = s.atr || 2.0;
    const half = cfg.spread / 2;
    const entry = side === "LONG" ? lastBar.c + half : lastBar.c - half;
    const slDist = atr * 1.2;
    const sl = side === "LONG" ? entry - slDist : entry + slDist;
    const tp = side === "LONG" ? entry + slDist * cfg.rr : entry - slDist * cfg.rr;
    const oz = customOz || Math.max(0.1, cfg.riskUSD / (slDist * cfg.pointValue));

    s.open = {
      id: s.nextId++,
      side,
      setup: "MANUAL · ORDER DESK",
      family: "MANUAL",
      identity: "breakout",
      entryIndex: s.bars.length - 1,
      entryTime: lastBar.t,
      entry,
      sl,
      tp,
      oz,
      risk: cfg.riskUSD,
      open: true,
    };

    playOrderFilledSound();
    addToast({
      title: `⚡ Manual ${side} Dispatched`,
      description: `${oz.toFixed(2)} oz @ ${entry.toFixed(2)} · SL ${sl.toFixed(2)} · TP ${tp.toFixed(2)}`,
      type: "success",
    });
    setTick((t) => t + 1);
  };

  const newScenario = () => {
    if (cfg.feedMode === "simulated") {
      stRef.current = createEngine(1 + Math.floor(Math.random() * 1e9), cfgRef.current);
      setTick((t) => t + 1);
    }
  };

  const toggleLiveMode = () => {
    const nextMode = cfg.feedMode === "live" ? "simulated" : "live";
    if (nextMode === "simulated") {
      stRef.current = createEngine(48271 + Math.floor(Math.random() * 900000), {
        ...cfgRef.current,
        feedMode: "simulated",
      });
    }
    patchCfg({ feedMode: nextMode });
    setTick((t) => t + 1);
  };

  const selectSymbol = (sym: string) => {
    const meta = getSymbolMeta(sym);
    patchCfg({ activeSymbol: sym, pointValue: meta.pointValue, spread: meta.spread });
    if (cfg.feedMode === "simulated") {
      stRef.current = createEngine(1 + Math.floor(Math.random() * 1e9), {
        ...cfgRef.current,
        activeSymbol: sym,
        pointValue: meta.pointValue,
        spread: meta.spread,
      });
      setTick((t) => t + 1);
    }
  };

  const selectTimeframe = (tf: Timeframe) => {
    patchCfg({ timeframe: tf });
    if (cfg.feedMode === "simulated") {
      stRef.current = createEngine(1 + Math.floor(Math.random() * 1e9), {
        ...cfgRef.current,
        timeframe: tf,
      });
      setTick((t) => t + 1);
    }
  };

  const toggleChartView = () => {
    patchCfg({ chartView: cfg.chartView === "tradingview" ? "native" : "tradingview" });
  };

  const handleSaveBrokerCfg = (newCfg: BrokerConfig) => {
    setBrokerCfg(newCfg);
    saveBrokerConfig(newCfg);
  };

  const pendingSignalsCount = st.queue.filter((q) => q.status === "PENDING").length;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#070b13] text-[#c9d1d9] font-sans antialiased selection:bg-[var(--gold)] selection:text-black">
      {/* 1. Left Global Suite Sidebar */}
      <GlobalSidebar
        activeView={dashboardView}
        onSelectView={setDashboardView}
        st={st}
        cfg={cfg}
        onOpenBrokerModal={() => setBrokerModalOpen(true)}
        onToggleSound={() => patchCfg({ soundEnabled: !cfg.soundEnabled })}
        soundEnabled={cfg.soundEnabled}
      />

      {/* 2. Main Content View Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Header Toolbar */}
        <HeaderBar
          st={st}
          cfg={cfg}
          running={running}
          onToggleRun={() => setRunning((r) => !r)}
          speed={speed}
          onSpeed={setSpeed}
          onNewScenario={newScenario}
          onToggleLiveMode={toggleLiveMode}
          onSelectSymbol={selectSymbol}
          onSelectTimeframe={selectTimeframe}
          onToggleChartView={toggleChartView}
          onToggleSound={() => patchCfg({ soundEnabled: !cfg.soundEnabled })}
          onOpenBrokerSettings={() => setBrokerModalOpen(true)}
          onOpenGuide={() => setDashboardView("academy")}
          onOpenQuickOrder={(side) => {
            setUniversalOrderSide(side);
            setUniversalOrderOpen(true);
          }}
          tick={tick}
        />

        {/* Dynamic Route Content */}
        <div className="flex-1 flex overflow-hidden bg-[#080d18] relative">
          {/* VIEW: DASHBOARD OVERVIEW */}
          {dashboardView === "dashboard" && (
            <DashboardOverviewView
              st={st}
              cfg={cfg}
              stats={stats}
              onNavigateToTrades={() => setDashboardView("trades")}
              onNavigateToTerminal={() => setDashboardView("terminal")}
            />
          )}

          {/* VIEW: TRADES LEDGER */}
          {dashboardView === "trades" && (
            <TradesLedgerView st={st} cfg={cfg} />
          )}

          {/* VIEW: PERFORMANCE ANALYSIS */}
          {dashboardView === "analysis" && (
            <AnalysisMatrixView st={st} cfg={cfg} stats={stats} />
          )}

          {/* VIEW: STRATEGIES & RANGE BREAKOUT EA */}
          {dashboardView === "strategies" && (
            <StrategiesConfigView st={st} cfg={cfg} onCfg={patchCfg} />
          )}

          {/* VIEW: AUDIT REPORTS */}
          {dashboardView === "reports" && (
            <ReportsAuditView st={st} cfg={cfg} stats={stats} />
          )}

          {/* VIEW: VISUAL ACADEMY */}
          {dashboardView === "academy" && (
            <VisualAcademyView />
          )}

          {/* VIEW: SIGNALS QUEUE & DIRECT BROKER WIRE */}
          {dashboardView === "signals" && (
            <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4 font-mono text-xs">
              <div
                className="rounded-xl border p-4 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-3"
                style={{ borderColor: "var(--line)", background: "linear-gradient(180deg, #131c2d 0%, #0e1522 100%)" }}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--gold)] text-black font-extrabold text-xs">
                      ⚡
                    </span>
                    <h1 className="text-base font-bold text-white tracking-wide">
                      SIGNALS & DIRECT BROKER EXECUTION HUB
                    </h1>
                  </div>
                  <p className="text-[11px] text-[var(--muted)] mt-1">
                    Real-time algorithmic signal queue, MetaTrader 5 direct order dispatcher, and live execution audit logs.
                  </p>
                </div>

                <button
                  onClick={() => setBrokerModalOpen(true)}
                  className="px-4 py-2 rounded-lg bg-[var(--gold)]/15 border border-[var(--gold)] text-[var(--gold)] font-bold text-[11px] hover:bg-[var(--gold)]/25 transition-all"
                >
                  ⚙️ CONFIGURE BROKER & TELEGRAM
                </button>
              </div>

              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 lg:col-span-6">
                  <ActionCenter st={st} cfg={cfg} onDecide={onDecide} />
                </div>

                <div className="col-span-12 lg:col-span-6">
                  <div className="rounded-xl border p-4 bg-[var(--bg1)] h-[500px] flex flex-col" style={{ borderColor: "var(--line)" }}>
                    <div className="flex items-center justify-between border-b pb-2 mb-2" style={{ borderColor: "var(--line)" }}>
                      <span className="font-bold text-white text-[12px]">ENGINE EXECUTION WIRE</span>
                      <span className="text-[9px] text-[var(--dim)]">LIVE EVENT STREAM</span>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      <EventFeed st={st} />
                    </div>
                  </div>
                </div>
              </div>
            </main>
          )}

          {/* VIEW: LIVE TRADING TERMINAL */}
          {dashboardView === "terminal" && (
            <main className="flex-1 overflow-y-auto p-2.5 lg:p-3 custom-scrollbar">
              <div className="mx-auto grid w-full max-w-[1880px] grid-cols-12 items-start gap-2.5">
                {/* Left Column: Watchlist */}
                <section className="hidden md:block md:col-span-3 lg:col-span-2">
                  <MarketWatchlist
                    activeSymbol={cfg.activeSymbol}
                    onSelect={selectSymbol}
                    price={st.bars[st.bars.length - 1]?.c || st.price}
                    feedMode={cfg.feedMode}
                  />
                </section>

                {/* Center Column: Chart & Dock */}
                <section className="col-span-12 md:col-span-9 lg:col-span-7 flex flex-col gap-2.5">
                  <PipelineStrip st={st} />

                  <CandleChart
                    st={st}
                    cfg={cfg}
                    onDecide={onDecide}
                    onMoveToBreakeven={() => {
                      moveToBreakeven(st, cfg);
                      setTick((t) => t + 1);
                    }}
                    onPartialClose={(ratio) => {
                      partialClose(st, cfg, ratio);
                      setTick((t) => t + 1);
                    }}
                  />

                  <BottomTerminalTabs
                    st={st}
                    cfg={cfg}
                    stats={stats}
                    onClosePosition={closeOpenPosition}
                    onMoveToBreakeven={handleMoveToBreakeven}
                    onPartialClose={handlePartialClose}
                  />
                </section>

                {/* Right Column: Execution Desk & Radar */}
                <aside className="col-span-12 lg:col-span-3 flex flex-col gap-2 font-mono">
                  <div
                    className="flex items-center rounded-lg border p-0.5"
                    style={{ borderColor: "var(--line)", background: "var(--bg2)" }}
                  >
                    <button
                      onClick={() => setRightTab("signals")}
                      className={`flex-1 py-1.5 rounded text-[10px] font-bold transition-all relative ${
                        rightTab === "signals"
                          ? "bg-[var(--gold)] text-black font-black"
                          : "text-[var(--muted)] hover:text-white"
                      }`}
                    >
                      <span>⚡ SIGNALS</span>
                      {pendingSignalsCount > 0 && (
                        <span className="ml-1 px-1 py-px rounded-full bg-[var(--short)] text-white text-[8px] font-extrabold animate-bounce">
                          {pendingSignalsCount}
                        </span>
                      )}
                    </button>

                    <button
                      onClick={() => setRightTab("order")}
                      className={`flex-1 py-1.5 rounded text-[10px] font-bold transition-all ${
                        rightTab === "order"
                          ? "bg-[var(--gold)] text-black font-black"
                          : "text-[var(--muted)] hover:text-white"
                      }`}
                    >
                      🎯 ORDER DESK
                    </button>

                    <button
                      onClick={() => setRightTab("strategy")}
                      className={`flex-1 py-1.5 rounded text-[10px] font-bold transition-all ${
                        rightTab === "strategy"
                          ? "bg-[var(--gold)] text-black font-black"
                          : "text-[var(--muted)] hover:text-white"
                      }`}
                    >
                      🧠 RADAR
                    </button>

                    <button
                      onClick={() => setRightTab("risk")}
                      className={`flex-1 py-1.5 rounded text-[10px] font-bold transition-all ${
                        rightTab === "risk"
                          ? "bg-[var(--gold)] text-black font-black"
                          : "text-[var(--muted)] hover:text-white"
                      }`}
                    >
                      🛡️ RISK
                    </button>
                  </div>

                  {rightTab === "signals" && (
                    <div className="min-h-[300px]">
                      <ActionCenter st={st} cfg={cfg} onDecide={onDecide} />
                    </div>
                  )}

                  {rightTab === "order" && (
                    <OrderDesk st={st} cfg={cfg} onExecuteManual={handleExecuteManual} />
                  )}

                  {rightTab === "strategy" && (
                    <StrategyRadar st={st} cfg={cfg} onCfg={patchCfg} />
                  )}

                  {rightTab === "risk" && (
                    <ConsolePanel cfg={cfg} onCfg={patchCfg} onAoi={patchAoi} st={st} stats={stats} />
                  )}
                </aside>
              </div>
            </main>
          )}
        </div>
      </div>

      {/* Universal Order Modal */}
      <UniversalOrderModal
        isOpen={universalOrderOpen}
        onClose={() => setUniversalOrderOpen(false)}
        st={st}
        cfg={cfg}
        initialSide={universalOrderSide}
        onExecute={handleExecuteManual}
        onClosePosition={closeOpenPosition}
        onMoveToBreakeven={handleMoveToBreakeven}
      />

      {/* Floating 1-Click Quick Execution Pill */}
      <div className="fixed bottom-3 right-4 z-40 flex items-center gap-2 select-none">
        <button
          onClick={() => {
            setUniversalOrderSide("LONG");
            setUniversalOrderOpen(true);
          }}
          className="px-3.5 py-1.5 rounded-xl bg-[#2fc98f] hover:bg-[#34d399] text-black font-black text-[11px] tracking-wide shadow-lg active:scale-95 transition-all flex items-center gap-1 border border-black/20"
        >
          <span>▲ BUY</span>
        </button>

        <button
          onClick={() => {
            setUniversalOrderSide("SHORT");
            setUniversalOrderOpen(true);
          }}
          className="px-3.5 py-1.5 rounded-xl bg-[#f0546c] hover:bg-[#fb7185] text-black font-black text-[11px] tracking-wide shadow-lg active:scale-95 transition-all flex items-center gap-1 border border-black/20"
        >
          <span>▼ SELL</span>
        </button>

        <button
          onClick={() => setUniversalOrderOpen((v) => !v)}
          className="px-3 py-1.5 rounded-xl bg-[#0e1626]/95 border border-[var(--gold)] text-[var(--gold)] font-extrabold text-[11px] tracking-wide shadow-xl hover:bg-[#162238] active:scale-95 transition-all flex items-center gap-1.5 backdrop-blur-md"
        >
          <span>⚡ ORDER DESK [O]</span>
        </button>
      </div>

      {/* Settings Modals */}
      <BrokerSettingsModal
        isOpen={brokerModalOpen}
        onClose={() => setBrokerModalOpen(false)}
        config={brokerCfg}
        onSave={handleSaveBrokerCfg}
      />

      <StrategyGuideModal
        isOpen={guideModalOpen}
        onClose={() => setGuideModalOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <TerminalContent />
    </ToastProvider>
  );
}
