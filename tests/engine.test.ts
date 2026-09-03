import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import {
  DEFAULT_CFG,
  calculateRisk,
  createEngine,
  createLiveEngine,
  processClosedBar,
  feedLiveBar,
  decideQueue,
  approvalBlock,
} from "../src/engine/engine";
import {
  dispatchTradeOrder,
  validateEndpointUrl,
  fetchMt5NewsStatus,
} from "../src/engine/brokerDispatch";
import { fetchMt5Bars } from "../src/engine/liveFeed";
import {
  fetchLifecycle,
  reconcileLifecycle,
  type LifecycleStatus,
  type OperatorAction,
} from "../src/engine/lifecycle";
import { DEFAULT_BROKER_CFG } from "../src/engine/types";
import type { Bar, EngineConfig, QueueItem } from "../src/engine/types";
import {
  savePaperSession,
  restorePaperSession,
} from "../src/engine/paperSession";
import {
  saveTradeToJournal,
  loadAllJournalTrades,
} from "../src/engine/storage";

const config = (): EngineConfig => structuredClone(DEFAULT_CFG);
const monday = Date.UTC(2026, 7, 31, 10);
const bar = (time: number, close = 2650): Bar => ({
  t: time,
  o: close,
  h: close + 0.1,
  l: close - 0.1,
  c: close,
  v: 10,
  day: Math.floor(time / 86400000),
});
function fixture() {
  const cfg = config();
  const st = createEngine(123, cfg);
  st.bars = Array.from({ length: 720 }, (_, i) =>
    bar(monday - (719 - i) * 300000),
  );
  st.dayKey = st.bars[719].day;
  const q: QueueItem = {
    id: 999,
    signalId: st.sessionId + ":signal",
    source: "simulated",
    side: "LONG",
    setup: "SAFE",
    family: "SAFESCALPERPRO",
    identity: "breakout",
    entryIndex: 719,
    entryTime: monday,
    entry: 2650,
    sl: 2649.7,
    tp: 2650.45,
    brokerLots: 0.01,
    oz: 1,
    risk: 0.37,
    magicNumber: 202503,
    status: "PENDING",
    expiresAtIndex: 722,
    expiresAtTime: monday + 900000,
    dispatchStatus: "IDLE",
  };
  st.queue = [q];
  return { cfg, st, q };
}

test("native account-currency loss probe drives lot sizing", () => {
  const { cfg, st } = fixture();
  cfg.brokerSpec.lossPerLot100Points = 1000;
  const risk = calculateRisk(st, cfg);
  assert.equal(risk.allowed, false); // min .01 => 3.07 exceeds 2.50
});
test("minimum lot is not rounded up", () => {
  const { cfg, st } = fixture();
  st.equity = 5;
  assert.equal(calculateRisk(st, cfg).allowed, false);
});
test("free margin limits sizing", () => {
  const { cfg, st } = fixture();
  cfg.brokerSpec.freeMargin = 1;
  assert.equal(calculateRisk(st, cfg).allowed, false);
});
test("invalid finite values and zero native margin fail closed", () => {
  for (const [key, value] of [
    ["volumeStep", 0],
    ["marginPerMinLot", 0],
    ["lossPerLot100Points", NaN],
    ["freeMargin", Infinity],
  ] as const) {
    const { cfg, st } = fixture();
    cfg.brokerSpec[key] = value;
    assert.equal(calculateRisk(st, cfg).allowed, false);
  }
});
test("risk over one percent fails closed", () => {
  const { cfg, st } = fixture();
  cfg.safe.riskPercent = 1.01;
  assert.equal(calculateRisk(st, cfg).allowed, false);
});
test("stale and mock broker metadata cannot approve live risk", () => {
  const { cfg, st } = fixture();
  cfg.feedMode = "mt5";
  cfg.brokerSpec.source = "MT5";
  cfg.brokerSpec.checkedAt = Date.now() - 31000;
  assert.equal(calculateRisk(st, cfg).allowed, false);
  cfg.brokerSpec.source = "MOCK";
  cfg.brokerSpec.checkedAt = Date.now();
  assert.equal(calculateRisk(st, cfg).allowed, false);
});
test("completed candle is processed exactly once", () => {
  const { cfg, st } = fixture();
  const b = bar(monday + 300000);
  processClosedBar(st, cfg, b);
  const before = JSON.stringify(st);
  processClosedBar(st, cfg, { ...b, c: 2660 });
  assert.equal(JSON.stringify(st), before);
});
test("forming candle cannot overwrite completed history or evaluate gates", () => {
  const { cfg, st } = fixture();
  const history = JSON.stringify(st.bars),
    telemetry = JSON.stringify(st.telemetry);
  feedLiveBar(st, cfg, bar(monday, 2700), false);
  assert.equal(JSON.stringify(st.bars), history);
  assert.equal(JSON.stringify(st.telemetry), telemetry);
});
test("queue expiry still works when rolling window length is constant", () => {
  const { cfg, st, q } = fixture();
  st.bars = Array.from({ length: 2400 }, (_, i) =>
    bar(monday - (2399 - i) * 300000),
  );
  for (let n = 1; n <= 3; n++)
    processClosedBar(st, cfg, bar(monday + n * 300000));
  assert.equal(st.bars.length, 2400);
  assert.equal(q.status, "REJECTED");
});
test("approval rechecks changed news and risk instead of blindly opening", () => {
  const { cfg, st, q } = fixture();
  cfg.newsLocked = true;
  assert.equal(decideQueue(st, q.id, true, cfg), null);
  assert.equal(st.open, null);
  cfg.newsLocked = false;
  cfg.safe.riskPercent = 0.1;
  q.risk = 2.5;
  assert.match(approvalBlock(st, cfg, q), /Risk settings/);
});
test("duplicate approval cannot open twice", () => {
  const { cfg, st, q } = fixture();
  assert.ok(decideQueue(st, q.id, true, cfg));
  assert.equal(decideQueue(st, q.id, true, cfg), null);
  assert.equal(st.dailyTrades, 1);
});
test("broker mode never fabricates a local fill", () => {
  const { cfg, st, q } = fixture();
  cfg.feedMode = "mt5";
  q.source = "mt5";
  assert.equal(decideQueue(st, q.id, true, cfg), null);
  assert.equal(st.open, null);
});
test("broker mode never runs paper SL management", () => {
  const { cfg, st, q } = fixture();
  cfg.feedMode = "mt5";
  st.open = { ...q, source: "mt5", open: true };
  processClosedBar(st, cfg, bar(monday + 300000, 2640));
  assert.ok(st.open);
  assert.equal(st.trades.length, 0);
});
test("session IDs do not collide after engine reset", () => {
  assert.notEqual(createEngine(42).sessionId, createEngine(42).sessionId);
});
test("only safe endpoint protocols and exact loopback hosts", () => {
  for (const url of [
    "ftp://localhost/webhook",
    "http://evil.test/localhost",
    "http://localhost.evil.test",
    "https://user:secret@example.com",
    "https://example.com/?localhost",
  ])
    assert.equal(validateEndpointUrl(url).valid, false, url);
  for (const url of [
    "http://localhost:8000/webhook",
    "http://127.0.0.1:8000/webhook",
    "https://bridge.example.com/webhook",
  ])
    assert.equal(validateEndpointUrl(url).valid, true, url);
});
test("simulation dispatch is blocked before any network request", async () => {
  const { cfg, q } = fixture();
  let calls = 0;
  const old = globalThis.fetch;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("must not call");
  };
  try {
    const result = await dispatchTradeOrder(
      q,
      { ...DEFAULT_BROKER_CFG, mt5Enabled: true },
      cfg,
    );
    assert.equal(result.success, false);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = old;
  }
});
test("news transport errors fail closed", async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  try {
    const result = await fetchMt5NewsStatus(
      "http://localhost:8000/webhook",
      "test-token",
    );
    assert.equal(result.locked, true);
    assert.equal(result.available, false);
  } finally {
    globalThis.fetch = old;
  }
});
test("forming or unmarked bars from old bridge are rejected", async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ bars: [bar(monday)] }), { status: 200 });
  try {
    await assert.rejects(
      fetchMt5Bars(
        "http://localhost:8000/webhook",
        "test-token",
        "XAUUSD",
        "5m",
      ),
      /completed bars/,
    );
  } finally {
    globalThis.fetch = old;
  }
});

test("TypeScript and Python indicator values agree on the same 900 completed M5 bars", () => {
  const reference = JSON.parse(
    execFileSync("python3", ["tests/indicator_reference.py"], {
      encoding: "utf8",
    }),
  );
  const state = createLiveEngine(reference.bars, config());
  for (const [actual, key] of [
    [state.telemetry.emaFast, "safe_ema_fast"],
    [state.telemetry.emaSlow, "safe_ema_slow"],
    [state.telemetry.atr, "safe_atr"],
    [state.telemetry.rsi, "safe_rsi"],
  ] as const)
    assert.ok(Math.abs(actual - reference.expected[key]) < 1e-8, key);
  assert.equal(
    state.telemetry.gates[6].detail,
    reference.expected.safe_mtf_fast.toFixed(2) +
      " / " +
      reference.expected.safe_mtf_slow.toFixed(2),
  );
});

test("paper position and risk latch survive reload; journal IDs do not overwrite other sessions", () => {
  const memory = new Map<string, string>();
  const previous = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, v: string) => memory.set(key, v),
    },
  });
  try {
    const { cfg, st, q } = fixture();
    const trade = decideQueue(st, q.id, true, cfg)!;
    st.halted = true;
    st.haltReason = "Maximum drawdown";
    savePaperSession(st, cfg);
    const restored = restorePaperSession(77, cfg);
    assert.equal(restored.open?.signalId, trade.signalId);
    assert.equal(restored.halted, true);
    assert.equal(restored.dailyTrades, 1);
    saveTradeToJournal(trade);
    saveTradeToJournal({ ...trade, signalId: "another-session:signal" });
    assert.equal(loadAllJournalTrades().length, 2);
    memory.set("safe_scalper_paper_session_v1", "corrupt");
    assert.equal(restorePaperSession(77, cfg).open, null);
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: previous,
    });
  }
});

const lifecycleFixture = (): LifecycleStatus => ({
  account_id: "TEST-DEMO:123",
  account_mode: "DEMO",
  source: "MT5",
  operator_enabled: true,
  worker: {
    healthy: true,
    last_tick: Date.now() / 1000,
    last_error: "",
    account_id: "TEST-DEMO:123",
  },
  requests: [
    {
      signal_id: "test-signal-unknown",
      status: "UNKNOWN",
      submitted_at: Date.now() / 1000,
    },
  ],
  actions: [],
  positions: [],
  audit: [],
});
const reviewFixture = (): OperatorAction => ({
  operation_id: "test-review-operation-001",
  account_id: "TEST-DEMO:123",
  confirm_account_id: "TEST-DEMO:123",
  kind: "ENTRY",
  entity: "test-signal-unknown",
  broker_ticket: 9000,
  reason: "Checked the exact broker order evidence",
});

test("lifecycle reads reject account switching and malformed evidence", async () => {
  const original = globalThis.fetch;
  try {
    for (const data of [
      { ...lifecycleFixture(), account_id: "OTHER:999" },
      { ...lifecycleFixture(), actions: [{}] },
      { ...lifecycleFixture(), worker: null },
    ]) {
      globalThis.fetch = async () => new Response(JSON.stringify(data));
      await assert.rejects(
        fetchLifecycle("http://localhost:8000", "test", "TEST-DEMO:123"),
        /invalid or account changed/,
      );
    }
    globalThis.fetch = async () =>
      new Response(JSON.stringify(lifecycleFixture()));
    assert.equal(
      (await fetchLifecycle("http://localhost:8000", "test", "TEST-DEMO:123"))
        .requests.length,
      1,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("real/mock/unauthorized recovery is blocked before any network write", async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    throw new Error("Must not call");
  };
  try {
    for (const context of [
      { ...lifecycleFixture(), account_mode: "REAL" as const },
      { ...lifecycleFixture(), source: "MOCK" as const },
      { ...lifecycleFixture(), operator_enabled: false },
    ])
      await assert.rejects(
        reconcileLifecycle(
          "http://localhost:8000",
          "test",
          context,
          reviewFixture(),
        ),
        /Recovery requires/,
      );
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("recovery validates exact confirmation, positive order ticket and reason", async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    throw new Error("Must not call");
  };
  try {
    for (const change of [
      { confirm_account_id: "OTHER:999" },
      { broker_ticket: null },
      { broker_ticket: -1 },
      { broker_ticket: 1.5 },
      { reason: "short" },
    ])
      await assert.rejects(
        reconcileLifecycle(
          "http://localhost:8000",
          "test",
          lifecycleFixture(),
          { ...reviewFixture(), ...change },
        ),
        /Recovery requires/,
      );
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("recovery targets ledger endpoint only and preserves operation ID across retry", async () => {
  const original = globalThis.fetch;
  const bodies: string[] = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "http://localhost:8000/operator/reconcile");
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "error");
    bodies.push(String(init?.body));
    if (bodies.length === 1)
      throw new Error("Connection lost after ledger write");
    return new Response(
      JSON.stringify({
        status: "FILLED",
        evidence: { ticket: 9000, volume: 0.02 },
      }),
    );
  };
  try {
    const operation = reviewFixture();
    await assert.rejects(
      reconcileLifecycle(
        "http://localhost:8000/webhook",
        "test",
        lifecycleFixture(),
        operation,
      ),
    );
    assert.equal(
      (
        await reconcileLifecycle(
          "http://localhost:8000/webhook",
          "test",
          lifecycleFixture(),
          operation,
        )
      ).status,
      "FILLED",
    );
    assert.equal(bodies[0], bodies[1]);
  } finally {
    globalThis.fetch = original;
  }
});

test("incomplete reconciliation receipts cannot mark an entry as filled", async () => {
  const original = globalThis.fetch;
  try {
    for (const result of [
      { status: "FILLED" },
      { status: "FILLED", evidence: { ticket: 0, volume: 0.02 } },
      { status: "CONFIRMED" },
    ]) {
      globalThis.fetch = async () => new Response(JSON.stringify(result));
      await assert.rejects(
        reconcileLifecycle(
          "http://localhost:8000",
          "test",
          lifecycleFixture(),
          reviewFixture(),
        ),
        /response incomplete/,
      );
    }
  } finally {
    globalThis.fetch = original;
  }
});
