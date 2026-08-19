import { BrokerConfig, DEFAULT_BROKER_CFG, fmtP, fmtUSD, QueueItem, Trade } from "./types";

const STORAGE_KEY = "tf_broker_config_v1";

export function loadBrokerConfig(): BrokerConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_BROKER_CFG, ...JSON.parse(raw) };
  } catch (e) {
    console.warn("Failed to load broker config from storage:", e);
  }
  return DEFAULT_BROKER_CFG;
}

export function saveBrokerConfig(cfg: BrokerConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch (e) {
    console.warn("Failed to save broker config to storage:", e);
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
 * Dispatch an approved trade signal to MT5, Telegram, and generic Webhook.
 */
export async function dispatchTradeOrder(
  item: QueueItem | Trade,
  symbol: string,
  cfg: BrokerConfig
): Promise<DispatchResult> {
  const targets: DispatchResult["targets"] = {};
  let overallSuccess = true;
  let summaryMessages: string[] = [];

  const side = "side" in item ? item.side : "LONG";
  const action = side === "LONG" ? "BUY" : "SELL";
  const contracts = item.oz || 1;
  const entry = item.entry;
  const sl = item.sl;
  const tp = item.tp;

  // 1. MetaTrader 5 Bridge
  if (cfg.mt5Enabled && cfg.mt5Url) {
    try {
      const payload = {
        secret: cfg.mt5Secret,
        ticker: symbol,
        action,
        qty: Number(contracts.toFixed(2)),
        price: Number(entry.toFixed(4)),
        sl: Number(sl.toFixed(4)),
        tp: Number(tp.toFixed(4)),
        comment: `TradingFlow_${item.setup || "Signal"}`,
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
      });

      if (res.ok) {
        const data = await res.json();
        targets.mt5 = { ok: true, msg: `MT5 Executed: Ticket #${data.ticket || data.order_id || "Filled"}` };
        summaryMessages.push(`MT5 Order Placed`);
      } else {
        const errText = await res.text();
        targets.mt5 = { ok: false, msg: `MT5 Error (${res.status}): ${errText.slice(0, 80)}` };
        overallSuccess = false;
        summaryMessages.push(`MT5 Failed`);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "network error";
      targets.mt5 = { ok: false, msg: `MT5 Bridge unreachable (${errMsg})` };
      overallSuccess = false;
      summaryMessages.push(`MT5 Unreachable`);
    }
  }

  // 2. Telegram Alerts
  if (cfg.telegramEnabled && cfg.telegramToken && cfg.telegramChatId) {
    try {
      const emoji = action === "BUY" ? "🟢" : "🔴";
      const tgText = `
${emoji} *TRADING FLOW LIVE SIGNAL*
━━━━━━━━━━━━━━━━━
*Symbol:* \`${symbol}\`
*Action:* *${action}*
*Setup:* ${item.setup || "AOI Sweep"}
*Entry:* \`${fmtP(entry)}\`
*Stop Loss:* \`${fmtP(sl)}\`
*Take Profit:* \`${fmtP(tp)}\`
*Risk:* ${fmtUSD(item.risk)} | *Size:* \`${contracts.toFixed(2)}\`
━━━━━━━━━━━━━━━━━
_Dispatched at ${new Date().toISOString().slice(11, 19)} UTC_
`.trim();

      const tgUrl = `https://api.telegram.org/bot${cfg.telegramToken}/sendMessage`;
      const res = await fetch(tgUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: cfg.telegramChatId,
          text: tgText,
          parse_mode: "Markdown",
        }),
      });

      if (res.ok) {
        targets.telegram = { ok: true, msg: "Telegram notification sent" };
        summaryMessages.push("Telegram Sent");
      } else {
        const data = await res.json();
        targets.telegram = { ok: false, msg: data.description || "Failed to send telegram" };
        overallSuccess = false;
        summaryMessages.push("Telegram Failed");
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      targets.telegram = { ok: false, msg: `Telegram error: ${errMsg}` };
      overallSuccess = false;
    }
  }

  // 3. Generic Webhook
  if (cfg.webhookEnabled && cfg.webhookUrl) {
    try {
      const payload = {
        symbol,
        action,
        entry,
        sl,
        tp,
        volume: contracts,
        risk: item.risk,
        setup: item.setup,
        timestamp: Date.now(),
      };
      const res = await fetch(cfg.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        targets.webhook = { ok: true, msg: "Webhook delivered" };
        summaryMessages.push("Webhook Sent");
      } else {
        targets.webhook = { ok: false, msg: `Webhook HTTP ${res.status}` };
        overallSuccess = false;
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      targets.webhook = { ok: false, msg: `Webhook error: ${errMsg}` };
      overallSuccess = false;
    }
  }

  if (summaryMessages.length === 0) {
    summaryMessages.push("No live broker destinations enabled (Simulation only)");
  }

  return {
    success: overallSuccess,
    message: summaryMessages.join(" | "),
    targets,
  };
}

/**
 * Ping test for MT5 bridge
 */
export async function testMt5Bridge(url: string): Promise<{ ok: boolean; msg: string }> {
  try {
    const healthUrl = url.replace(/\/webhook\/?$/, "/health");
    const res = await fetch(healthUrl, { method: "GET" });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, msg: `Bridge Connected! MT5: ${data.mt5_connected ? "Online ✅" : "Terminal not connected ⚠️"}` };
    }
    return { ok: false, msg: `Server returned HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, msg: `Could not reach ${url}. Make sure run-mt5-bridge.bat is running!` };
  }
}

/**
 * Test Telegram Bot connection
 */
export async function testTelegram(token: string, chatId: string): Promise<{ ok: boolean; msg: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "⚡ *Trading Flow:* Test connection successful! Ready to receive live alerts.",
        parse_mode: "Markdown",
      }),
    });
    if (res.ok) return { ok: true, msg: "Test message sent to Telegram! Check your phone." };
    const d = await res.json();
    return { ok: false, msg: d.description || `Telegram error ${res.status}` };
  } catch (e: any) {
    return { ok: false, msg: `Telegram network error: ${e?.message}` };
  }
}
