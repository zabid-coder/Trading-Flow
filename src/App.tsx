import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BrokerConfig, EngineConfig, EngineState, Timeframe } from "./engine/types";
import { fmtUSD } from "./engine/types";
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
import HeaderBar, { SPEEDS } from "./components/HeaderBar";
import CandleChart from "./components/CandleChart";
import PipelineStrip from "./components/PipelineStrip";
import ActionCenter from "./components/ActionCenter";
import ConsolePanel from "./components/ConsolePanel";
import StrategyRadar from "./components/StrategyRadar";
import OrderDesk from "./components/OrderDesk";
import MarketWatchlist from "./components/MarketWatchlist";
import BottomTerminalTabs from "./components/BottomTerminalTabs";
import BrokerSettingsModal from "./components/BrokerSettingsModal";
import StrategyGuideModal from "./components/StrategyGuideModal";

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

  const stRef = useRef<EngineState | null>(null);
  if (!stRef.current) {
    stRef.current = createEngine(48271 + Math.floor(Math.random() * 900000), DEFAULT_CFG);
  }

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
      // Don't intercept typing in inputs or textareas
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
      } else if (e.key === "b" || e.key === "B" || e.key === "l" || e.key === "L") {
        setRightTab("order");
      } else if (e.key === "s" || e.key === "S") {
        setRightTab("order");
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

  // Simulation tick loop (only runs when feedMode === 'simulated')
  useEffect(() => {
    if (!running || cfg.feedMode === "live") return;
    const perTick = speed === 3 ? 3 : 1;
    const id = window.setInterval(() => {
      const st = stRef.current;
      if (!st) return;

      const prevOpenCount = st.open ? 1 : 0;
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
            type: "warning",
          });
        }
      }

      setTick((t) => t + 1);
    }, SPEEDS[speed].ms);
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

      // 1. Fetch real historical bars for active timeframe
      const initialBars = await fetchHistoricalBars(sym, tf, 100);
      if (!isCurrent) return;

      stRef.current = createLiveEngine(sym, initialBars, cfgRef.current);
      setTick((t) => t + 1);

      // 2. Connect real-time WebSocket
      cleanupWs = connectLiveFeed(sym, tf, {
        onBar: (bar, isClosed) => {
          const st = stRef.current;
          if (!st) return;
          feedLiveBar(st, cfgRef.current, bar, isClosed);

          // Auto-dispatch check if enabled
          if (brokerCfgRef.current.autoDispatch) {
            const pending = st.queue.filter((q) => q.status === "PENDING");
            for (const q of pending) {
              onDecide(q.id, true);
            }
          }

          setTick((t) => t + 1);
        },
        onStatus: (status, latency) => {
          const st = stRef.current;
          if (st) {
            st.liveStatus = status;
            st.liveLatency = latency;
            setTick((t) => t + 1);
          }
        },
      });
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
        title: `Order Approved: ${item.side}`,
        description: `${item.setup} @ ${item.entry.toFixed(2)}`,
        type: "success",
      });

      if (cfg.feedMode === "live") {
        item.dispatchStatus = "SENDING";
        setTick((t) => t + 1);

        try {
          const res = await dispatchTradeOrder(item, cfg.activeSymbol, brokerCfgRef.current);
          item.dispatchStatus = res.success ? "SENT" : "FAILED";
          item.dispatchMsg = res.message;
          addToast({
            title: res.success ? "Broker Dispatch: Sent" : "Broker Dispatch: Failed",
            description: res.message,
            type: res.success ? "success" : "error",
          });
        } catch (err: unknown) {
          item.dispatchStatus = "FAILED";
          item.dispatchMsg = err instanceof Error ? err.message : "Dispatch error";
        }
      }
    } else {
      addToast({
        title: "Signal Rejected",
        description: `Rejected ${item.setup}`,
        type: "info",
      });
    }

    decideQueue(s, cfgRef.current, id, approve);
    setTick((t) => t + 1);
  };

  const handleExecuteManual = async (tradeParams: {
    side: "LONG" | "SHORT";
    entry: number;
    sl: number;
    tp: number;
    oz: number;
    risk: number;
  }) => {
    const s = stRef.current;
    if (!s) return;

    const newTrade = {
      id: s.nextId++,
      side: tradeParams.side,
      setup: "MANUAL DISPATCH",
      family: "DISCRETIONARY",
      identity: cfg.identity,
      entryIndex: s.bars.length - 1,
      entryTime: Date.now(),
      entry: tradeParams.entry,
      sl: tradeParams.sl,
      tp: tradeParams.tp,
      oz: tradeParams.oz,
      risk: tradeParams.risk,
      open: true,
    };

    s.open = newTrade;
    s.trades.push(newTrade);
    playOrderFilledSound();
    addToast({
      title: `⚡ Manual ${tradeParams.side} Executed`,
      description: `${tradeParams.oz.toFixed(2)} units @ $${tradeParams.risk} Risk`,
      type: "success",
    });

    if (cfg.feedMode === "live") {
      await dispatchTradeOrder(newTrade, cfg.activeSymbol, brokerCfgRef.current);
    }

    setTick((t) => t + 1);
  };

  const handleMoveToBreakeven = () => {
    const s = stRef.current;
    if (s && s.open) {
      moveToBreakeven(s, cfgRef.current);
      playBeSound();
      addToast({
        title: "⚡ Breakeven Locked",
        description: `Stop moved to entry ${s.open.sl.toFixed(2)}`,
        type: "success",
      });
      setTick((t) => t + 1);
    }
  };

  const handlePartialClose = (ratio: number = 0.5) => {
    const s = stRef.current;
    if (s && s.open) {
      partialClose(s, cfgRef.current, ratio);
      playTpSound();
      addToast({
        title: `💰 50% Profit Booked`,
        description: `Scaled out half position`,
        type: "success",
      });
      setTick((t) => t + 1);
    }
  };

  const closeOpenPosition = () => {
    const s = stRef.current;
    if (s && s.open) {
      const lastBar = s.bars[s.bars.length - 1];
      const exitPrice = lastBar ? lastBar.c : s.price;
      const half = cfg.spread / 2;
      const pnl =
        s.open.oz *
        (s.open.side === "LONG"
          ? exitPrice - half - s.open.entry
          : s.open.entry - (exitPrice + half));

      s.open.open = false;
      s.open.exit = exitPrice;
      s.open.exitTime = Date.now();
      s.open.pnl = pnl;
      s.balance += pnl;
      s.open = null;

      saveJournalTrades(s.trades);
      addToast({
        title: "Position Liquidated",
        description: `Closed at ${exitPrice.toFixed(2)} (${pnl >= 0 ? "+" : "-"}$${Math.abs(pnl).toFixed(0)})`,
        type: "info",
      });
      setTick((t) => t + 1);
    }
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
    <div className="flex min-h-screen flex-col bg-[#070b13] text-[#c9d1d9] font-sans antialiased selection:bg-[var(--gold)] selection:text-black">
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
        onOpenGuide={() => setGuideModalOpen(true)}
        tick={tick}
      />

      {/* Modals */}
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

      {/* Main 3-Column Professional Trading Workspace */}
      <main className="mx-auto grid w-full max-w-[1880px] flex-1 grid-cols-12 items-start gap-2.5 p-2.5 lg:p-3">
        {/* Left Column: Watchlist (2 cols on lg, 2 on xl) */}
        <section className="hidden md:block md:col-span-3 lg:col-span-2">
          <MarketWatchlist
            activeSymbol={cfg.activeSymbol}
            onSelect={selectSymbol}
            price={st.bars[st.bars.length - 1]?.c || st.price}
            feedMode={cfg.feedMode}
          />
        </section>

        {/* Center Column: Main Interactive Chart & Bottom Dock (7 cols on lg, 7 on xl) */}
        <section className="col-span-12 md:col-span-9 lg:col-span-7 flex flex-col gap-2.5">
          {/* Live Pipeline Strip */}
          <PipelineStrip st={st} />

          {/* Interactive Chart with 1-Click Overlays */}
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

          {/* Structured Bottom Dock */}
          <BottomTerminalTabs
            st={st}
            cfg={cfg}
            stats={stats}
            onClosePosition={closeOpenPosition}
            onMoveToBreakeven={handleMoveToBreakeven}
            onPartialClose={handlePartialClose}
          />
        </section>

        {/* Right Column: Execution & Strategy Desk (3 cols on lg, 3 on xl) */}
        <aside className="col-span-12 lg:col-span-3 flex flex-col gap-2 font-mono">
          {/* Tab Selector */}
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

          {/* Active Tab Panel */}
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
      </main>

      {/* Terminal Status Footer */}
      <footer
        className="border-t px-4 py-2 flex flex-wrap items-center justify-between font-mono text-[10px] text-[var(--dim)]"
        style={{ borderColor: "var(--line)", background: "#05080e" }}
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${
                cfg.feedMode === "live" ? "bg-[var(--long)] animate-pulse" : "bg-[var(--gold)]"
              }`}
            />
            <span className="font-bold text-white">
              {cfg.feedMode === "live"
                ? `LIVE FEED ONLINE · ${cfg.activeSymbol}`
                : `SIMULATION CALIBRATED · ${cfg.activeSymbol}`}
            </span>
          </span>
          <span>·</span>
          <span>TIMEFRAME: {cfg.timeframe.toUpperCase()}</span>
          <span>·</span>
          <span>SPREAD: {cfg.spread} pts</span>
          <span>·</span>
          <span className="text-[var(--gold-hi)]">HOTKEYS: [SPACE] PAUSE | [1-3] SPEED | [B/S] ORDER | [X] CLOSE | [M] MUTE</span>
        </div>

        <div className="flex items-center gap-3">
          <span>ACCOUNT: {fmtUSD(st.balance)}</span>
          <span>·</span>
          <span>EQUITY: {fmtUSD(stats.equityNow)}</span>
        </div>
      </footer>
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
