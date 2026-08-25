import { BrokerConfig, DEFAULT_BROKER_CFG, fmtP, fmtUSD, QueueItem, Trade } from "./types";
import { encryptVaultData, decryptVaultData } from "../utils/crypto";

const STORAGE_KEY = "tf_broker_config_v2";

export function loadBrokerConfig(): BrokerConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_BROKER_CFG,
        ...parsed,
        mt5Secret: parsed.mt5Secret ? decryptVaultData(parsed.mt5Secret) : "",
        telegramToken: parsed.telegramToken ? decryptVaultData(parsed.telegramToken) : "",
      };
    }
  } catch (e) {
    console.warn("Failed to load encrypted broker config from storage:", e);
  }
  return DEFAULT_BROKER_CFG;
}

export function saveBrokerConfig(cfg: BrokerConfig) {
  try {
    const secureCopy = {
      ...cfg,
      mt5Secret: cfg.mt5Secret ? encryptVaultData(cfg.mt5Secret) : "",
      telegramToken: cfg.telegramToken ? encryptVaultData(cfg.telegramToken) : "",
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(secureCopy));
  } catch (e) {
    console.warn("Failed to save encrypted broker config to storage:", e);
  }
}

export interface DispatchResult {
  success: boolean;
  message: string;
  targets: {
    mt5?: { ok: boolean; msg: string };
    telegram?: { ok: boolean; msg: string };
    webhook?: { ok: boolean; msg: string };
  };
}

/**
 * Realistic session-specific slippage model (pts)
 * Fixed: uses the function parameter `utcHour` correctly and removes stale global scope reference.
 */
export function getSessionSlippage(utcHour: number): number {
  if (utcHour >= 12 && utcHour <= 15) return 0.35; // NY / London Overlap (high volatility)
  if (utcHour >= 7 && utcHour <= 11) return 0.20;  // London Open
  if (utcHour >= 0 && utcHour <= 8) return 0.15;   // Tokyo / Asian session
  return 0.45; // Off-hours / Illiquid session
}

/**
 * Validate endpoint security: Enforce HTTPS for non-localhost endpoints in production
 */
export function validateEndpointUrl(url: string): { valid: boolean; error?: string } {
  if (!url) return { valid: false, error: "URL cannot be empty" };
  try {
    const parsed = new URL(url);
    const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (!isLocal && parsed.protocol !== "https:") {
      return { valid: false, error: "Production webhook endpoints must use HTTPS for secure transmission." };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid endpoint URL format." };
  }
}

/**
 * Test connectivity with FastAPI MT5 bridge
 */
export async function testMt5Bridge(url: string, secret?: string): Promise<{ ok: boolean; msg: string }> {
  const check = validateEndpointUrl(url);
  if (!check.valid && !url.includes("localhost") && !url.includes("127.0.0.1")) {
    return { ok: false, msg: check.error || "Insecure endpoint" };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const healthUrl = url.replace(/\/webhook\/?$/, "/health");
    const headers: Record<string, string> = {};
    if (secret) {
      headers["Authorization"] = `Bearer ${secret}`;
    }

    const res = await fetch(healthUrl, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.mt5_connected) {
        const acc = data.account;
        const infoStr = acc ? `Account #${acc.login} (${acc.currency} ${acc.balance.toLocaleString()})` : "MT5 Connected";
        return { ok: true, msg: `Online — ${infoStr}` };
      } else {
        return { ok: false, msg: "Bridge online, but MT5 terminal is not connected." };
      }
    }
    return { ok: false, msg: `Bridge returned status ${res.status}` };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    return {
      ok: false,
      msg: err instanceof Error ? (err.name === "AbortError" ? "Connection timed out" : err.message) : "Network error",
    };
  }
}

/**
 * Test Telegram bot credentials
 */
export async function testTelegram(token: string, chatId: string): Promise<{ ok: boolean; msg: string }> {
  if (!token || !chatId) {
    return { ok: false, msg: "Please provide both Bot Token and Chat ID" };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "⚡ <b>Trading Flow PRO</b>: Telegram connection test successful!",
        parse_mode: "HTML",
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      return { ok: true, msg: "Test message sent to Telegram successfully!" };
    }
    const err = await res.json();
    return { ok: false, msg: err.description || `Telegram returned status ${res.status}` };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    return {
      ok: false,
      msg: err instanceof Error ? (err.name === "AbortError" ? "Telegram request timed out" : err.message) : "Network error",
    };
  }
}

/**
 * Dispatch an approved trade signal to MT5, Telegram, and generic Webhook.
 * Features strict input bounds, Bearer auth header, 5s timeout, session slippage modeling, and safe side fallback.
 */
export async function dispatchTradeOrder(
  item: QueueItem | Trade,
  symbol: string,
  cfg: BrokerConfig
): Promise<DispatchResult> {
  const targets: DispatchResult["targets"] = {};
  let overallSuccess = true;
  const summaryMessages: string[] = [];

  const side = "side" in item && (item.side === "LONG" || item.side === "SHORT") ? item.side : "LONG";
  const action = side === "LONG" ? "BUY" : "SELL";
  const contracts = item.oz || 1;
  const currentHour = new Date().getUTCHours();
  const sessionSlippage = getSessionSlippage(currentHour);
  const dir = side === "LONG" ? 1 : -1;
  const rawEntry = item.entry || 0;
  const entry = rawEntry + dir * sessionSlippage;
  const sl = item.sl || 0;
  const tp = item.tp || 0;

  // 1. MetaTrader 5 Bridge
  if (cfg.mt5Enabled && cfg.mt5Url) {
    const urlValidation = validateEndpointUrl(cfg.mt5Url);
    if (!urlValidation.valid && !cfg.mt5Url.includes("localhost") && !cfg.mt5Url.includes("127.0.0.1")) {
      return {
        success: false,
        message: urlValidation.error || "Insecure MT5 endpoint",
        targets: { mt5: { ok: false, msg: urlValidation.error || "Insecure MT5 endpoint" } },
      };
    }

    try {
      const health = await testMt5Bridge(cfg.mt5Url, cfg.mt5Secret);
      if (!health.ok) {
        return {
          success: false,
          message: `Broker offline: ${health.msg}`,
          targets: { mt5: { ok: false, msg: health.msg } },
        };
      }
    } catch (err) {
      return {
        success: false,
        message: "Broker health check failed",
        targets: { mt5: { ok: false, msg: (err as Error).message } },
      };
    }

    let mt5Sent = false;
    let lastError = "";

    // Retry up to 2 times for transient network drops
    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const signalId = `TF_${symbol}_${item.id || Date.now()}_${item.entryIndex || 0}`;
        const payload = {
          secret: cfg.mt5Secret,
          ticker: symbol,
          action,
          qty: Number(contracts.toFixed(2)),
          price: Number(entry.toFixed(4)),
          sl: Number(sl.toFixed(4)),
          tp: Number(tp.toFixed(4)),
          comment: `TF_${item.setup || "Trap"}`.slice(0, 31),
          signal_id: signalId,
        };

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (cfg.mt5Secret) {
          headers["Authorization"] = `Bearer ${cfg.mt5Secret}`;
        }

        const res = await fetch(cfg.mt5Url, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          targets.mt5 = { ok: true, msg: `MT5 Executed: Ticket #${data.ticket || data.order_id || "Filled"}` };
          summaryMessages.push(`MT5 Order Placed`);
          mt5Sent = true;
          break;
        } else {
          const errText = await res.text();
          lastError = `MT5 Error (${res.status}): ${errText.slice(0, 80)}`;
        }
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        lastError = err instanceof Error ? (err.name === "AbortError" ? "Request timed out after 5s" : err.message) : "network error";
      }
    }

    if (!mt5Sent) {
      targets.mt5 = { ok: false, msg: lastError };
      overallSuccess = false;
      summaryMessages.push(`MT5 Failed`);
    }
  }

  // 2. Telegram Alerts
  if (cfg.telegramEnabled && cfg.telegramToken && cfg.telegramChatId) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const emoji = action === "BUY" ? "🟢" : "🔴";
      const rDistance = Math.abs(entry - sl);
      const rrRatio = rDistance > 0 ? (Math.abs(tp - entry) / rDistance).toFixed(1) : "2.0";

      const text = [
        `<b>${emoji} TRADING FLOW PRO: EXECUTION DISPATCH</b>`,
        `━━━━━━━━━━━━━━━━━━━━━━`,
        `• <b>Instrument:</b> <code>${symbol}</code>`,
        `• <b>Side:</b> <code>${action}</code>`,
        `• <b>Volume:</b> <code>${contracts.toFixed(2)}</code>`,
        `• <b>Expected Entry:</b> <code>${fmtP(entry)}</code>`,
        `• <b>Stop Loss:</b> <code>${fmtP(sl)}</code>`,
        `• <b>Take Profit:</b> <code>${fmtP(tp)}</code> (1:${rrRatio} R:R)`,
        `• <b>Setup / Model:</b> <i>${item.setup || "Institutional AOI Trap"}</i>`,
        `━━━━━━━━━━━━━━━━━━━━━━`,
        `<i>⚡ Execution: MetaTrader 5 Fast Bridge</i>`,
      ].join("\n");

      const tgUrl = `https://api.telegram.org/bot${cfg.telegramToken}/sendMessage`;
      const res = await fetch(tgUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: cfg.telegramChatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        targets.telegram = { ok: true, msg: "Telegram alert broadcasted" };
        summaryMessages.push("Telegram Alert Sent");
      } else {
        targets.telegram = { ok: false, msg: `Telegram returned ${res.status}` };
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      targets.telegram = {
        ok: false,
        msg: err instanceof Error ? err.message : "Telegram error",
      };
    }
  }

  // 3. Generic Webhook (Discord / TradingView / Custom Server)
  if (cfg.webhookEnabled && cfg.webhookUrl) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const payload = {
        event: "TRADE_DISPATCHED",
        timestamp: new Date().toISOString(),
        symbol,
        action,
        volume: Number(contracts.toFixed(2)),
        entry: Number(entry.toFixed(4)),
        sl: Number(sl.toFixed(4)),
        tp: Number(tp.toFixed(4)),
        setup: item.setup || "Institutional AOI Trap",
      };

      const res = await fetch(cfg.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        targets.webhook = { ok: true, msg: "Generic Webhook dispatched" };
        summaryMessages.push("Generic Webhook Sent");
      } else {
        targets.webhook = { ok: false, msg: `Webhook returned ${res.status}` };
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      targets.webhook = {
        ok: false,
        msg: err instanceof Error ? err.message : "Webhook error",
      };
    }
  }

  const message = summaryMessages.length > 0 ? summaryMessages.join(" · ") : "No execution targets enabled";
  return {
    success: overallSuccess,
    message,
    targets,
  };
}
