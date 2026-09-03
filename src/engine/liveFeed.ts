import type { Bar, Timeframe } from "./types";
import { SUPPORTED_SYMBOLS, TIMEFRAMES } from "./types";
import { bridgeRequest } from "./brokerDispatch";

export const getSymbolMeta = (symbol: string) =>
  SUPPORTED_SYMBOLS.find((item) => item.symbol === symbol) ??
  SUPPORTED_SYMBOLS[0];
export const getTimeframeMeta = (timeframe: Timeframe) =>
  TIMEFRAMES.find((item) => item.label === timeframe) ?? TIMEFRAMES[1];

export async function fetchMt5Bars(
  url: string,
  secret: string,
  symbol: string,
  timeframe: Timeframe,
  limit = 900,
): Promise<Bar[]> {
  const body = await bridgeRequest(
    url,
    secret,
    "/bars/" +
      encodeURIComponent(symbol) +
      "?timeframe=" +
      timeframe +
      "&limit=" +
      limit,
  );
  if (
    body.closed_only !== true ||
    !Array.isArray(body.bars) ||
    !body.bars.length
  )
    throw new Error("Bridge must return completed bars only");
  let previous = 0;
  return body.bars.map((bar: Bar) => {
    if (
      [bar.t, bar.o, bar.h, bar.l, bar.c, bar.v].some(
        (n) => !Number.isFinite(n),
      ) ||
      bar.t <= previous ||
      bar.t + getTimeframeMeta(timeframe).ms > Date.now() + 5000 ||
      bar.l <= 0 ||
      bar.v < 0 ||
      bar.l > Math.min(bar.o, bar.c) ||
      bar.h < Math.max(bar.o, bar.c)
    )
      throw new Error("Invalid/duplicate/forming broker candle");
    previous = bar.t;
    return { ...bar, day: Math.floor(bar.t / 86_400_000) };
  });
}

export function connectMt5Feed(
  url: string,
  secret: string,
  symbol: string,
  timeframe: Timeframe,
  listener: {
    onBar: (bar: Bar, closed: boolean) => void;
    onStatus: (
      status: "connecting" | "connected" | "disconnected" | "error",
      latency: number,
    ) => void;
  },
  lastClosedTime = 0,
) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const poll = async () => {
    const started = Date.now();
    try {
      const bars = await fetchMt5Bars(url, secret, symbol, timeframe, 900);
      if (stopped) return;
      if (
        lastClosedTime &&
        bars[0].t > lastClosedTime + getTimeframeMeta(timeframe).ms
      )
        throw new Error("Feed history gap — reconnect for warmup");
      listener.onStatus("connected", Date.now() - started);
      for (const bar of bars)
        if (bar.t > lastClosedTime) {
          lastClosedTime = bar.t;
          listener.onBar(bar, true);
        }
    } catch {
      if (!stopped) listener.onStatus("error", 0);
    } finally {
      if (!stopped) timer = setTimeout(poll, 5000);
    }
  };
  listener.onStatus("connecting", 0);
  void poll();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
