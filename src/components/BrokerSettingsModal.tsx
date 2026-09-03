import { useState } from "react";
import { BrokerConfig } from "../engine/types";
import { testMt5Bridge, testTelegram } from "../engine/brokerDispatch";

interface BrokerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: BrokerConfig;
  onSave: (cfg: BrokerConfig) => void;
}

export default function BrokerSettingsModal({
  isOpen,
  onClose,
  config,
  onSave,
}: BrokerSettingsModalProps) {
  const [cfg, setCfg] = useState<BrokerConfig>(config);
  const [mt5TestStatus, setMt5TestStatus] = useState<{
    testing: boolean;
    result?: string;
    ok?: boolean;
  }>({ testing: false });
  const [tgTestStatus, setTgTestStatus] = useState<{
    testing: boolean;
    result?: string;
    ok?: boolean;
  }>({ testing: false });

  if (!isOpen) return null;

  const handleTestMt5 = async () => {
    setMt5TestStatus({ testing: true });
    const res = await testMt5Bridge(cfg.mt5Url, cfg.mt5Secret);
    setMt5TestStatus({ testing: false, result: res.msg, ok: res.ok });
  };

  const handleTestTelegram = async () => {
    setTgTestStatus({ testing: true });
    const res = await testTelegram(cfg.telegramToken, cfg.telegramChatId);
    setTgTestStatus({ testing: false, result: res.msg, ok: res.ok });
  };

  const handleSave = () => {
    onSave(cfg);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-fade-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Broker settings"
        className="w-full max-w-2xl rounded-xl border p-6 shadow-2xl font-mono text-[12px] glass-panel border-white/15"
        style={{ color: "var(--ink)" }}
      >
        <div className="flex items-center justify-between border-b pb-3 mb-4 border-white/10">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--gold)] animate-pulse" />
            <h2 className="text-sm font-bold tracking-wider text-[var(--gold)]">
              MT5 MONITORING & DEMO SETTINGS
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--dim)] hover:text-[var(--ink)] text-sm px-2 py-1"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          {/* Dispatch Mode */}
          <div
            className="p-3 rounded border"
            style={{ borderColor: "var(--line)", background: "var(--bg2)" }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-[var(--ink)] text-[12px]">
                  Execution Mode
                </div>
                <div className="text-[10px] text-[var(--muted)]">
                  Broker orders are supervised and demo-only. Real trading and
                  generic order webhooks are locked.
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={false}
                  disabled
                  onChange={(e) =>
                    setCfg({ ...cfg, autoDispatch: e.target.checked })
                  }
                  className="rounded accent-[var(--gold)]"
                />
                <span
                  className="text-[11px] font-bold"
                  style={{
                    color: cfg.autoDispatch ? "var(--long)" : "var(--dim)",
                  }}
                >
                  {cfg.autoDispatch
                    ? "FULL AUTO"
                    : "SUPERVISED (ACTION CENTER)"}
                </span>
              </label>
            </div>
          </div>

          {/* MT5 / Exness Local Receiver */}
          <div
            className="p-3.5 rounded border space-y-3"
            style={{ borderColor: "var(--line)", background: "var(--bg2)" }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="mt5-toggle"
                  checked={cfg.mt5Enabled}
                  onChange={(e) =>
                    setCfg({ ...cfg, mt5Enabled: e.target.checked })
                  }
                  className="rounded accent-[var(--gold)]"
                />
                <label
                  htmlFor="mt5-toggle"
                  className="font-bold cursor-pointer text-[var(--ink)]"
                >
                  MetaTrader 5 / Exness Bridge (Local Python Receiver)
                </label>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--gold)]/10 text-[var(--gold)] font-bold">
                DEMO / MONITOR ONLY
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div>
                <span className="block text-[9px] text-[var(--dim)] mb-1">
                  BRIDGE WEBHOOK URL
                </span>
                <input
                  type="text"
                  value={cfg.mt5Url}
                  onChange={(e) => setCfg({ ...cfg, mt5Url: e.target.value })}
                  placeholder="http://localhost:8000/webhook"
                  className="w-full rounded border px-2.5 py-1.5 outline-none focus:border-[var(--gold)] text-[11px]"
                  style={{
                    borderColor: "var(--line)",
                    background: "var(--bg)",
                    color: "var(--ink)",
                  }}
                />
              </div>
              <div>
                <span className="block text-[9px] text-[var(--dim)] mb-1">
                  BEARER TOKEN · MEMORY ONLY (RE-ENTER AFTER RELOAD)
                </span>
                <input
                  type="password"
                  value={cfg.mt5Secret}
                  onChange={(e) =>
                    setCfg({ ...cfg, mt5Secret: e.target.value })
                  }
                  placeholder="TF-SECRET-KEY"
                  className="w-full rounded border px-2.5 py-1.5 outline-none focus:border-[var(--gold)] text-[11px]"
                  style={{
                    borderColor: "var(--line)",
                    background: "var(--bg)",
                    color: "var(--ink)",
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleTestMt5}
                disabled={mt5TestStatus.testing}
                className="px-3 py-1 rounded bg-[var(--gold)]/15 text-[var(--gold)] hover:bg-[var(--gold)]/25 transition-colors text-[10px] font-bold"
              >
                {mt5TestStatus.testing
                  ? "Testing..."
                  : "⚡ Test MT5 Connection"}
              </button>
              {mt5TestStatus.result && (
                <span
                  className="text-[10px] font-bold"
                  style={{
                    color: mt5TestStatus.ok ? "var(--long)" : "var(--short)",
                  }}
                >
                  {mt5TestStatus.result}
                </span>
              )}
            </div>
            <div className="text-[9.5px] text-[var(--dim)] leading-relaxed">
              Run <code className="text-[var(--gold)]">run-mt5-bridge.bat</code>{" "}
              on your Windows MT5 host for monitoring. Set the host token first;
              real-account execution remains blocked.
            </div>
          </div>

          {/* Telegram Mobile Alerts */}
          <div
            className="p-3.5 rounded border space-y-3"
            style={{ borderColor: "var(--line)", background: "var(--bg2)" }}
          >
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="tg-toggle"
                checked={cfg.telegramEnabled}
                onChange={(e) =>
                  setCfg({ ...cfg, telegramEnabled: e.target.checked })
                }
                className="rounded accent-[var(--gold)]"
              />
              <label
                htmlFor="tg-toggle"
                className="font-bold cursor-pointer text-[var(--ink)]"
              >
                Telegram Instant Phone Signals (Zero Budget Semi-Auto)
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div>
                <span className="block text-[9px] text-[var(--dim)] mb-1">
                  BOT TOKEN (from @BotFather)
                </span>
                <input
                  type="text"
                  value={cfg.telegramToken}
                  onChange={(e) =>
                    setCfg({ ...cfg, telegramToken: e.target.value })
                  }
                  placeholder="123456789:ABCdef..."
                  className="w-full rounded border px-2.5 py-1.5 outline-none focus:border-[var(--gold)] text-[11px]"
                  style={{
                    borderColor: "var(--line)",
                    background: "var(--bg)",
                    color: "var(--ink)",
                  }}
                />
              </div>
              <div>
                <span className="block text-[9px] text-[var(--dim)] mb-1">
                  CHAT ID (from @userinfobot)
                </span>
                <input
                  type="text"
                  value={cfg.telegramChatId}
                  onChange={(e) =>
                    setCfg({ ...cfg, telegramChatId: e.target.value })
                  }
                  placeholder="987654321"
                  className="w-full rounded border px-2.5 py-1.5 outline-none focus:border-[var(--gold)] text-[11px]"
                  style={{
                    borderColor: "var(--line)",
                    background: "var(--bg)",
                    color: "var(--ink)",
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleTestTelegram}
                disabled={
                  tgTestStatus.testing ||
                  !cfg.telegramToken ||
                  !cfg.telegramChatId
                }
                className="px-3 py-1 rounded bg-[var(--info)]/15 text-[var(--info)] hover:bg-[var(--info)]/25 transition-colors text-[10px] font-bold disabled:opacity-40"
              >
                {tgTestStatus.testing ? "Sending..." : "📲 Send Test Alert"}
              </button>
              {tgTestStatus.result && (
                <span
                  className="text-[10px] font-bold"
                  style={{
                    color: tgTestStatus.ok ? "var(--long)" : "var(--short)",
                  }}
                >
                  {tgTestStatus.result}
                </span>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-400">
            Generic order webhooks are disabled to prevent bypassing MT5 risk
            checks. Credentials are not saved to browser storage.
          </p>
        </div>

        <div
          className="flex items-center justify-end gap-3 mt-5 pt-3 border-t"
          style={{ borderColor: "var(--line)" }}
        >
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded border text-[11px] text-[var(--muted)] hover:text-[var(--ink)]"
            style={{ borderColor: "var(--line)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-1.5 rounded bg-[var(--gold)] text-black font-bold text-[11px] hover:brightness-110 transition-all"
          >
            Save Broker Config
          </button>
        </div>
      </div>
    </div>
  );
}
