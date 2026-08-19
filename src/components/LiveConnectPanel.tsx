import { useEffect, useRef, useState } from "react";
import Reveal from "./Reveal";

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: Record<string, unknown>) => unknown;
    };
  }
}

const TOPOLOGY = [
  { k: "TV", label: "TradingView Alert", where: "cloud · Essential+ webhook", tone: "var(--info)" },
  { k: "RX", label: "FastAPI Receiver", where: "your Windows PC / VPS · :8000", tone: "var(--gold)" },
  { k: "MT5", label: "MT5 Terminal", where: "Windows · algo trading enabled", tone: "var(--gold-hi)" },
  { k: "EX", label: "Exness Broker", where: "live / demo account", tone: "var(--long)" },
];

const CHECKS = [
  { id: "mt5", label: "MT5 terminal open, Exness logged in, Tools → Options → Expert Advisors → “Allow Algorithmic Trading” ticked." },
  { id: "recv", label: "Receiver running on that same PC: uvicorn webhook_receiver_v2:app --host 0.0.0.0 --port 8000 (secret set via TF_WEBHOOK_SECRET)." },
  { id: "tv", label: "TradingView (Essential+) alert attached to the Pine strategy, webhook URL = the one generated below, message = order-fill JSON." },
  { id: "test", label: "Sent a test payload and confirmed /health returns mt5_connected: true, then a demo-account order fills end-to-end." },
];

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[8px] tracking-[0.18em] text-[var(--dim)]">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border px-2.5 py-1.5 font-mono text-[10.5px] outline-none transition-colors focus:border-[var(--gold)]"
        style={{ borderColor: "var(--line)", background: "var(--bg2)", color: "var(--ink)" }}
      />
    </label>
  );
}

export default function LiveConnectPanel() {
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetInit = useRef(false);
  const [widgetOk, setWidgetOk] = useState<boolean | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  const [server, setServer] = useState("Exness-MT5Real8");
  const [login, setLogin] = useState("");
  const [webhookBase, setWebhookBase] = useState("https://your-vps.example.com:8000");
  const [secret, setSecret] = useState("TF-CHANGE-ME");

  // embed the REAL TradingView chart (streams live market data, read-only)
  useEffect(() => {
    if (widgetInit.current) return;
    widgetInit.current = true;

    const boot = () => {
      if (!window.TradingView || !widgetRef.current) return;
      try {
        new window.TradingView.widget({
          autosize: true,
          symbol: "EXNESS:XAUUSD",
          interval: "15",
          timezone: "Etc/UTC",
          theme: "dark",
          style: "1",
          locale: "en",
          toolbar_bg: "#0e1522",
          enable_publishing: false,
          hide_top_toolbar: false,
          allow_symbol_change: true,
          backgroundColor: "#0e1522",
          gridColor: "rgba(127,149,180,0.08)",
          container_id: "tf-tv-widget",
        });
        setWidgetOk(true);
      } catch {
        setWidgetOk(false);
      }
    };

    if (window.TradingView) {
      boot();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://s3.tradingview.com/tv.js";
    s.async = true;
    s.onload = boot;
    s.onerror = () => setWidgetOk(false);
    document.head.appendChild(s);
  }, []);

  const tvWebhookUrl = `${webhookBase.replace(/\/$/, "")}/webhook`;
  const healthUrl = `${webhookBase.replace(/\/$/, "")}/health`;
  const uvicornCmd = `set TF_WEBHOOK_SECRET=${secret} && set TF_EXNESS_SERVER=${server}${
    login ? ` && set TF_EXNESS_LOGIN=${login}` : ""
  } && uvicorn webhook_receiver_v2:app --host 0.0.0.0 --port 8000`;
  const testPayload = JSON.stringify(
    {
      ticker: "XAUUSD",
      action: "buy",
      stop_loss: 2030.5,
      take_profit: 2037.4,
      risk_usd: 375.0,
      secret_token: secret,
    },
    null,
    2
  );

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1400);
  };

  const CopyBtn = ({ id, text, label }: { id: string; text: string; label: string }) => (
    <button
      onClick={() => copy(id, text)}
      className="seg-btn shrink-0 rounded border px-2 py-0.5 font-mono text-[8.5px] font-bold tracking-[0.12em]"
      style={{
        borderColor: copied === id ? "var(--long)" : "var(--line)",
        color: copied === id ? "var(--long)" : "var(--muted)",
        background: copied === id ? "rgba(47,201,143,0.1)" : "var(--bg2)",
      }}
    >
      {copied === id ? "COPIED ✓" : label}
    </button>
  );

  const doneCount = CHECKS.filter((c) => checks[c.id]).length;

  return (
    <Reveal>
      <div className="panel mt-0 p-4" style={{ borderTop: "2px solid var(--info)" }}>
        {/* header */}
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="8" cy="8" r="2.4" stroke="var(--info)" strokeWidth="1.4" />
            <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2" stroke="var(--info)" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" stroke="var(--info)" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
          </svg>
          <div>
            <div className="panel-title" style={{ color: "var(--info)" }}>Live Connection Hub</div>
            <div className="font-body text-[10.5px] italic text-[var(--muted)]">
              Real TradingView market data runs right here in the browser. Exness / MT5 execution runs on{" "}
              <span className="not-italic font-mono text-[9.5px]" style={{ color: "var(--gold)" }}>your Windows PC</span> — a browser must never click “buy” on your broker.
            </div>
          </div>
          <span
            className="ml-auto rounded-sm px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.16em]"
            style={{ color: "var(--long)", background: "rgba(47,201,143,0.12)", border: "1px solid rgba(47,201,143,0.4)" }}
          >
            {doneCount}/{CHECKS.length} HOPS VERIFIED
          </span>
        </div>

        {/* topology flow */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {TOPOLOGY.map((t, i) => (
            <div key={t.k} className="flex items-center gap-2">
              {i > 0 && (
                <svg width="26" height="10" viewBox="0 0 26 10" fill="none" aria-hidden>
                  <path d="M1 5h18m0 0-5-4m5 4-5 4" stroke="var(--dim)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="dash-drift" strokeDasharray="4 3" />
                </svg>
              )}
              <div className="rounded-md border px-3 py-2 text-center transition-transform duration-200 hover:-translate-y-0.5" style={{ borderColor: `${t.tone}55`, background: "var(--bg1)" }}>
                <div className="font-mono text-[9px] font-bold tracking-[0.14em]" style={{ color: t.tone }}>
                  {t.k} · {t.label}
                </div>
                <div className="mt-0.5 font-mono text-[8px] text-[var(--dim)]">{t.where}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-12 gap-3">
          {/* real TradingView chart */}
          <div className="col-span-12 lg:col-span-7">
            <div className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-md border" style={{ borderColor: "var(--line-soft)", background: "var(--bg1)" }}>
              <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: "var(--line-soft)" }}>
                <span className="font-mono text-[9px] tracking-[0.2em]" style={{ color: "var(--info)" }}>
                  REAL MARKET · EXNESS:XAUUSD · 15M
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[8.5px] tracking-[0.14em] text-[var(--dim)]">
                  <span className={`h-1.5 w-1.5 rounded-full ${widgetOk === false ? "" : "blink-soft"}`} style={{ background: widgetOk === false ? "var(--short)" : "var(--long)" }} />
                  {widgetOk === false ? "WIDGET BLOCKED (offline?)" : widgetOk ? "LIVE DATA" : "CONNECTING…"}
                </span>
              </div>
              <div ref={widgetRef} id="tf-tv-widget" className="min-h-0 flex-1">
                {widgetOk === false && (
                  <div className="flex h-full items-center justify-center p-6 text-center font-body text-[11px] italic text-[var(--dim)]">
                    The live chart widget could not load (no internet or blocked). Everything else in the console still works on the synthetic feed.
                  </div>
                )}
              </div>
              <div className="border-t px-3 py-1.5 font-body text-[9.5px] italic text-[var(--dim)]" style={{ borderColor: "var(--line-soft)" }}>
                Read-only market data. Change symbol, interval and indicators with the widget’s own toolbar.
              </div>
            </div>
          </div>

          {/* config + commands + checklist */}
          <div className="col-span-12 flex flex-col gap-3 lg:col-span-5">
            <div className="rounded-md border p-3" style={{ borderColor: "var(--line-soft)", background: "var(--bg1)" }}>
              <div className="mb-2 font-mono text-[9px] tracking-[0.22em] text-[var(--dim)]">YOUR ACCOUNT CONFIG</div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="EXNESS SERVER" value={server} onChange={setServer} placeholder="Exness-MT5Real8" />
                <Field label="MT5 LOGIN (optional here)" value={login} onChange={setLogin} placeholder="12345678" />
                <Field label="RECEIVER BASE URL" value={webhookBase} onChange={setWebhookBase} placeholder="https://your-vps:8000" />
                <Field label="WEBHOOK SECRET" value={secret} onChange={setSecret} placeholder="TF-CHANGE-ME" />
              </div>
              <div className="mt-2 font-body text-[9.5px] italic leading-snug text-[var(--dim)]">
                Nothing is stored or sent anywhere — these values only build the commands below, in your browser. Keep the real secret out of any repo.
              </div>
            </div>

            <div className="space-y-2">
              {[
                { id: "uvicorn", label: "RECEIVER LAUNCH (run on the MT5 PC)", text: uvicornCmd },
                { id: "hook", label: "TRADINGVIEW WEBHOOK URL (paste in the alert)", text: tvWebhookUrl },
                { id: "health", label: "HEALTH CHECK (receiver must answer this)", text: healthUrl },
                { id: "payload", label: "TEST PAYLOAD (POST to /webhook)", text: testPayload },
              ].map((c) => (
                <div key={c.id} className="rounded-md border p-2.5" style={{ borderColor: "var(--line-soft)", background: "var(--bg1)" }}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="font-mono text-[8.5px] tracking-[0.16em] text-[var(--dim)]">{c.label}</span>
                    <CopyBtn id={c.id} text={c.text} label="COPY" />
                  </div>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded border p-2 font-mono text-[9.5px] leading-relaxed" style={{ borderColor: "var(--line-soft)", background: "var(--bg0)", color: c.id === "payload" ? "var(--gold-hi)" : "var(--ink)" }}>
                    {c.text}
                  </pre>
                </div>
              ))}
            </div>

            <div className="rounded-md border p-3" style={{ borderColor: "var(--line-soft)", background: "var(--bg1)" }}>
              <div className="mb-2 font-mono text-[9px] tracking-[0.22em] text-[var(--dim)]">GO-LIVE CHECKLIST</div>
              <div className="space-y-1.5">
                {CHECKS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setChecks((p) => ({ ...p, [c.id]: !p[c.id] }))}
                    className="group flex w-full items-start gap-2 rounded border px-2 py-1.5 text-left transition-all duration-200 hover:translate-x-[2px]"
                    style={{
                      borderColor: checks[c.id] ? "rgba(47,201,143,0.5)" : "var(--line-soft)",
                      background: checks[c.id] ? "rgba(47,201,143,0.06)" : "var(--bg2)",
                    }}
                  >
                    <span
                      className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition-colors"
                      style={{ borderColor: checks[c.id] ? "var(--long)" : "var(--line)", background: checks[c.id] ? "var(--long)" : "transparent" }}
                    >
                      {checks[c.id] && (
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
                          <path d="M1.5 4.2 3.3 6 6.5 2" stroke="#08130d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className="font-body text-[10px] leading-snug" style={{ color: checks[c.id] ? "var(--muted)" : "var(--ink)" }}>
                      {c.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Reveal>
  );
}
