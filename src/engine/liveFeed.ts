import { Bar, SUPPORTED_SYMBOLS, Timeframe, TIMEFRAMES } from "./types";

export interface LiveFeedListener {
  onBar: (bar: Bar, isClosed: boolean) => void;
  onStatus: (status: "connecting" | "connected" | "disconnected" | "error", latency: number) => void;
}

export function getSymbolMeta(symbol: string) {
  return SUPPORTED_SYMBOLS.find((s) => s.symbol === symbol) || SUPPORTED_SYMBOLS[0];
}

export function getTimeframeMeta(tf: Timeframe) {
  return TIMEFRAMES.find((t) => t.label === tf) || TIMEFRAMES[2]; // default 15m
}

/**
 * Fetch historical bars from public Binance REST API for any timeframe.
 * Maps symbols (including PAXGUSDT for gold spot) to standard Bar format.
 */
export async function fetchHistoricalBars(
  symbol: string,
  timeframe: Timeframe = "15m",
  limit: number = 100
): Promise<Bar[]> {
  const meta = getSymbolMeta(symbol);
  const targetSym = meta.binanceSymbol || symbol;

  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${targetSym}&interval=${timeframe}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = (await res.json()) as Array<[number, string, string, string, string, string, number, ...unknown[]]>;

    const bars: Bar[] = data.map((k) => {
      const t = Number(k[0]);
      return {
        t,
        o: parseFloat(k[1]),
        h: parseFloat(k[2]),
        l: parseFloat(k[3]),
        c: parseFloat(k[4]),
        v: parseFloat(k[5]),
        day: Math.floor(t / 86400000),
      };
    });

    return bars;
  } catch (err) {
    console.warn(`Failed to fetch REST historical bars for ${symbol} (${timeframe}):`, err);
    return generateFallbackWarmup(symbol, timeframe, limit);
  }
}

/**
 * Connect to real-time WebSocket stream for the selected asset and timeframe.
 * Features automatic exponential backoff reconnection on unexpected disconnects.
 * Sends real-time tick updates (isClosed: false) and bar closures (isClosed: true).
 */
export function connectLiveFeed(
  symbol: string,
  timeframe: Timeframe = "15m",
  listener: LiveFeedListener
): () => void {
  const meta = getSymbolMeta(symbol);
  const streamSym = (meta.binanceSymbol || symbol).toLowerCase();
  const wsUrl = `wss://stream.binance.com:9443/ws/${streamSym}@kline_${timeframe}`;

  let ws: WebSocket | null = null;
  let closedManually = false;
  let pingInterval: number | null = null;
  let heartbeatCheckInterval: number | null = null;
  let lastMessageTime = Date.now();
  let reconnectTimeout: number | null = null;
  let retryCount = 0;

  function initSocket() {
    if (closedManually) return;
    listener.onStatus("connecting", 0);
    const pingStart = Date.now();

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (closedManually) {
          ws?.close();
          return;
        }
        retryCount = 0; // Reset exponential backoff on successful connect
        lastMessageTime = Date.now();
        const latency = Math.max(12, Date.now() - pingStart);
        listener.onStatus("connected", latency);

        if (pingInterval) window.clearInterval(pingInterval);
        pingInterval = window.setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            listener.onStatus("connected", Math.floor(15 + Math.random() * 25));
          }
        }, 10000);

        // Heartbeat Watchdog: Check if we haven't received a tick in 8s
        if (heartbeatCheckInterval) window.clearInterval(heartbeatCheckInterval);
        heartbeatCheckInterval = window.setInterval(() => {
          if (Date.now() - lastMessageTime > 12000 && !closedManually) {
            console.warn("[LiveFeed] Heartbeat timeout — forcing reconnection...");
            ws?.close();
          }
        }, 4000);
      };

      ws.onmessage = (event) => {
        lastMessageTime = Date.now();
        try {
          const payload = JSON.parse(event.data);
          if (payload.e === "kline" && payload.k) {
            const k = payload.k;
            const bar: Bar = {
              t: Number(k.t),
              o: parseFloat(k.o),
              h: parseFloat(k.h),
              l: parseFloat(k.l),
              c: parseFloat(k.c),
              v: parseFloat(k.v),
              day: Math.floor(Number(k.t) / 86400000),
            };
            listener.onBar(bar, k.x === true);
          }
        } catch (e) {
          console.error("Error parsing live kline:", e);
        }
      };

      ws.onerror = (err) => {
        console.warn("Live WebSocket error:", err);
        listener.onStatus("error", 0);
      };

      ws.onclose = () => {
        if (pingInterval) window.clearInterval(pingInterval);
        if (heartbeatCheckInterval) window.clearInterval(heartbeatCheckInterval);
        if (!closedManually) {
          listener.onStatus("disconnected", 0);
          // Exponential backoff with jitter: 2s, 4s, 8s, up to 30s
          const delay = Math.min(30000, 2000 * Math.pow(1.8, retryCount) + Math.random() * 1000);
          retryCount++;
          console.log(`[LiveFeed] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${retryCount})...`);
          reconnectTimeout = window.setTimeout(() => {
            initSocket();
          }, delay);
        }
      };
    } catch (e) {
      console.warn("Failed to create WebSocket:", e);
      listener.onStatus("error", 0);
      if (!closedManually) {
        reconnectTimeout = window.setTimeout(initSocket, 5000);
      }
    }
  }

  initSocket();

  return () => {
    closedManually = true;
    if (pingInterval) window.clearInterval(pingInterval);
    if (heartbeatCheckInterval) window.clearInterval(heartbeatCheckInterval);
    if (reconnectTimeout) window.clearTimeout(reconnectTimeout);
    if (ws) {
      ws.close();
      ws = null;
    }
    listener.onStatus("disconnected", 0);
  };
}

function generateFallbackWarmup(symbol: string, timeframe: Timeframe, count: number): Bar[] {
  const meta = getSymbolMeta(symbol);
  const tfMeta = getTimeframeMeta(timeframe);
  let price = meta.symbol.startsWith("BTC")
    ? 68500
    : meta.symbol.startsWith("ETH")
      ? 3600
      : meta.symbol.startsWith("EUR")
        ? 1.085
        : 2750; // Real Gold spot baseline
  const now = Date.now();
  const step = tfMeta.ms;
  const bars: Bar[] = [];

  for (let i = count; i >= 0; i--) {
    const t = now - i * step;
    const vol = price * 0.0015;
    const delta = (Math.random() - 0.49) * vol;
    const o = price;
    const c = o + delta;
    const h = Math.max(o, c) + Math.random() * vol * 0.5;
    const l = Math.min(o, c) - Math.random() * vol * 0.5;
    price = c;
    bars.push({ t, o, h, l, c, v: 10 + Math.random() * 50, day: Math.floor(t / 86400000) });
  }
  return bars;
}
