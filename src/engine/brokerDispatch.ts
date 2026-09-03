import {
  BrokerConfig,
  BrokerSymbolSpec,
  DEFAULT_BROKER_CFG,
  EngineConfig,
  QueueItem,
} from "./types";

const STORAGE_KEY = "tf_broker_config_v2";

// Tokens stay in memory. The former fixed-XOR "vault" was not encryption.
// Saving settings strips legacy stored credentials; no automatic token migration.
export function loadBrokerConfig(): BrokerConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      ...DEFAULT_BROKER_CFG,
      ...raw,
      mt5Secret: "",
      telegramToken: "",
      autoDispatch: false,
      webhookEnabled: false,
    };
  } catch {
    return { ...DEFAULT_BROKER_CFG };
  }
}
export function saveBrokerConfig(cfg: BrokerConfig) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...cfg,
      mt5Secret: "",
      telegramToken: "",
      autoDispatch: false,
      webhookEnabled: false,
    }),
  );
}

export function validateEndpointUrl(url: string): {
  valid: boolean;
  error?: string;
} {
  try {
    const parsed = new URL(url);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if (
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      !(parsed.protocol === "https:" || (local && parsed.protocol === "http:"))
    ) {
      return {
        valid: false,
        error:
          "Use HTTPS (HTTP only on loopback), without credentials, query or fragment.",
      };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid bridge URL" };
  }
}

export class BridgeError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}
export async function bridgeRequest(
  url: string,
  secret: string,
  path: string,
  init: RequestInit = {},
) {
  const check = validateEndpointUrl(url);
  if (!check.valid) throw new BridgeError(check.error!);
  if (!secret)
    throw new BridgeError(
      "Enter the bridge Bearer token; credentials are kept only for this session.",
    );
  const base = url.replace(/\/webhook\/?$/, "").replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(base + path, {
      ...init,
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + secret,
      },
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok)
      throw new BridgeError(
        typeof data.detail === "string"
          ? data.detail
          : "Bridge rejected the payload",
        response.status,
      );
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function testMt5Bridge(
  url: string,
  secret = "",
): Promise<{ ok: boolean; msg: string }> {
  try {
    const data = await bridgeRequest(url, secret, "/health");
    return {
      ok:
        data.authenticated === true &&
        data.mt5_connected === true &&
        data.source === "MT5",
      msg:
        data.source === "MOCK"
          ? "Synthetic MOCK bridge — no MT5 terminal or execution"
          : data.execution_enabled
            ? "MT5 demo account — supervised orders enabled on host"
            : "MT5 monitoring connected — orders locked",
    };
  } catch (error) {
    return {
      ok: false,
      msg: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

export async function fetchBrokerSymbolSpec(
  url: string,
  secret: string,
  symbol: string,
): Promise<BrokerSymbolSpec> {
  const d = await bridgeRequest(
    url,
    secret,
    "/symbol-spec/" + encodeURIComponent(symbol),
  );
  const spec: BrokerSymbolSpec = {
    ready: d.source === "MT5",
    symbol: d.symbol,
    digits: d.digits,
    point: d.point,
    tickSize: d.tick_size,
    tickValue: d.tick_value,
    contractSize: d.contract_size,
    volumeMin: d.volume_min,
    volumeMax: d.volume_max,
    volumeStep: d.volume_step,
    stopsLevel: d.stops_level,
    freezeLevel: d.freeze_level,
    spreadPoints: d.spread_points,
    balance: d.account.balance,
    equity: d.account.equity,
    freeMargin: d.account.free_margin,
    currency: d.account.currency,
    marginPerMinLot: d.margin_per_min_lot,
    lossPerLot100Points: d.loss_per_lot_100_points,
    source: d.source === "MT5" ? "MT5" : "MOCK",
    checkedAt: d.checked_at,
    accountId: d.account.id,
    accountMode: d.account.mode,
    executionEnabled: d.execution_enabled === true,
    warning: d.warning,
  };
  const positive = [
    spec.point,
    spec.tickSize,
    spec.contractSize,
    spec.volumeMin,
    spec.volumeMax,
    spec.volumeStep,
    spec.equity,
    spec.marginPerMinLot,
    spec.lossPerLot100Points,
  ];
  if (
    positive.some((x) => !Number.isFinite(x) || x <= 0) ||
    !Number.isInteger(spec.digits) ||
    spec.digits < 0 ||
    spec.digits > 8 ||
    [
      spec.spreadPoints,
      spec.stopsLevel,
      spec.freezeLevel,
      spec.freeMargin,
    ].some((x) => !Number.isFinite(x) || x < 0) ||
    spec.volumeMin > spec.volumeMax ||
    !Number.isFinite(spec.checkedAt)
  )
    throw new BridgeError("Invalid broker contract metadata");
  return spec;
}

export interface NewsStatus {
  locked: boolean;
  label: string;
  available: boolean;
}
export async function fetchMt5NewsStatus(
  url: string,
  secret: string,
): Promise<NewsStatus> {
  try {
    const d = await bridgeRequest(url, secret, "/news-status");
    const available = d.available === true && typeof d.locked === "boolean";
    return {
      available,
      locked: !available || d.locked,
      label: String(d.label || "Native news guard unavailable"),
    };
  } catch {
    return {
      available: false,
      locked: true,
      label: "News guard unreachable — fail closed",
    };
  }
}

export interface BrokerPosition {
  ticket: number;
  symbol: string;
  type: number;
  volume: number;
  price_open: number;
  sl: number;
  tp: number;
  profit: number;
}
export interface BrokerDeal {
  ticket: number;
  symbol: string;
  time: number;
  volume: number;
  price: number;
  net: number;
  entry: number;
}
export interface BrokerSnapshot {
  source: "MT5" | "MOCK";
  account_id: string;
  account_mode: "DEMO" | "REAL" | "UNKNOWN";
  checked_at: number;
  balance: number;
  equity: number;
  free_margin: number;
  peak_equity: number;
  day_start_balance: number;
  daily_loss: number;
  daily_trades: number;
  drawdown_percent: number;
  halted: boolean;
  halt_reason: string;
  positions: BrokerPosition[];
  pending_orders: number;
  deals: BrokerDeal[];
}
export async function fetchBrokerSnapshot(
  url: string,
  secret: string,
): Promise<BrokerSnapshot> {
  const d = await bridgeRequest(url, secret, "/account-state");
  if (
    !Array.isArray(d.positions) ||
    !Array.isArray(d.deals) ||
    [
      d.balance,
      d.equity,
      d.free_margin,
      d.peak_equity,
      d.day_start_balance,
      d.daily_loss,
      d.daily_trades,
      d.drawdown_percent,
      d.checked_at,
    ].some((v) => !Number.isFinite(v) || v < 0)
  )
    throw new BridgeError("Invalid broker account state");
  return d;
}

export interface BrokerReceipt {
  status: "FILLED";
  signal_id: string;
  ticket: number;
  volume: number;
  fill_price: number;
  sl: number;
  tp: number;
  estimated_loss: number;
  account_id: string;
  source: "MT5";
  account_mode: "DEMO";
}
export interface DispatchResult {
  success: boolean;
  unknown?: boolean;
  message: string;
  receipt?: BrokerReceipt;
}

export async function dispatchTradeOrder(
  item: QueueItem,
  cfg: BrokerConfig,
  engine: EngineConfig,
): Promise<DispatchResult> {
  const spec = engine.brokerSpec;
  // This guard is inside the transport boundary, not just a disabled UI button.
  if (
    item.source !== "mt5" ||
    engine.feedMode !== "mt5" ||
    spec.source !== "MT5" ||
    spec.accountMode !== "DEMO" ||
    !spec.executionEnabled ||
    !cfg.mt5Enabled ||
    !spec.accountId ||
    !spec.ready ||
    engine.newsLocked ||
    Date.now() - spec.checkedAt > 30_000 ||
    item.dispatchStatus !== "SENDING"
  ) {
    return {
      success: false,
      message:
        "Execution locked: fresh MT5 demo context, news clearance and supervised approval required",
    };
  }
  if (
    Date.now() >= item.expiresAtTime ||
    !["LONG", "SHORT"].includes(item.side) ||
    [item.entry, item.sl, item.tp, item.risk, item.brokerLots].some(
      (x) => !Number.isFinite(x) || x <= 0,
    )
  ) {
    return { success: false, message: "Signal expired or invalid" };
  }
  try {
    const d = await bridgeRequest(cfg.mt5Url, cfg.mt5Secret, "/webhook", {
      method: "POST",
      body: JSON.stringify({
        ticker: spec.symbol,
        action: item.side === "LONG" ? "BUY" : "SELL",
        qty: item.brokerLots,
        price: item.entry,
        sl: item.sl,
        tp: item.tp,
        signal_id: item.signalId,
        account_id: spec.accountId,
        source: "mt5",
        signal_time: item.entryTime,
        expires_at: item.expiresAtTime,
        max_loss: item.risk,
        max_margin_pct: engine.safe.maxMarginPercent,
        magic: item.magicNumber,
      }),
    });
    if (
      d.status !== "FILLED" ||
      d.source !== "MT5" ||
      d.account_mode !== "DEMO" ||
      d.account_id !== spec.accountId ||
      d.signal_id !== item.signalId ||
      !Number.isInteger(d.ticket) ||
      d.ticket <= 0 ||
      [d.volume, d.fill_price, d.sl, d.tp].some(
        (x) => !Number.isFinite(x) || x <= 0,
      ) ||
      d.volume > item.brokerLots + 1e-8
    ) {
      return {
        success: false,
        unknown: true,
        message:
          "Invalid or ambiguous receipt — reconcile in MT5; do not resend",
      };
    }
    if (cfg.telegramEnabled && cfg.telegramToken && cfg.telegramChatId) {
      // Alerts never determine execution success and cannot trigger another order.
      void sendTelegram(
        cfg.telegramToken,
        cfg.telegramChatId,
        "SafeScalper DEMO fill #" + d.ticket + " · " + spec.symbol,
      ).catch(() => {});
    }
    return {
      success: true,
      receipt: d,
      message:
        "Broker DEMO fill confirmed, ticket #" +
        d.ticket +
        ". SL/TP on broker; advanced exits run on the demo host worker. Check System status.",
    };
  } catch (error) {
    const definitive =
      error instanceof BridgeError &&
      [401, 403, 422, 423, 429].includes(error.status);
    return {
      success: false,
      unknown: !definitive,
      message:
        (error instanceof Error ? error.message : "Network error") +
        (definitive ? "" : " — outcome uncertain; check MT5, do not resend"),
    };
  }
}

async function sendTelegram(token: string, chatId: string, text: string) {
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token))
    throw new Error("Invalid Telegram token format");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const result = await fetch(
      "https://api.telegram.org/bot" + token + "/sendMessage",
      {
        method: "POST",
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
        signal: controller.signal,
      },
    );
    const body = await result.json();
    if (!result.ok || body.ok !== true)
      throw new Error("Telegram delivery failed");
  } finally {
    clearTimeout(timer);
  }
}
export async function testTelegram(
  token: string,
  chatId: string,
): Promise<{ ok: boolean; msg: string }> {
  try {
    await sendTelegram(
      token,
      chatId,
      "SafeScalper notification test (no trade)",
    );
    return { ok: true, msg: "Test message sent" };
  } catch (error) {
    return {
      ok: false,
      msg: error instanceof Error ? error.message : "Telegram test failed",
    };
  }
}
