// Isolated visual/interaction fixture. Not imported by the production entry.
// Every fetch is handled in memory; there is no terminal or trading transport.
import React from "react";
import { createRoot } from "react-dom/client";
import LifecyclePanel from "../src/components/LifecyclePanel";
import type { LifecycleStatus, OperatorAction } from "../src/engine/lifecycle";
import "../src/index.css";

const account = "UI-FIXTURE-NOT-A-BROKER:123";
const fixture: LifecycleStatus = {
  account_id: account,
  account_mode: "DEMO",
  source: "MT5",
  operator_enabled: true,
  worker: {
    healthy: true,
    last_tick: Date.now() / 1000,
    last_error: "",
    account_id: account,
  },
  requests: [
    {
      signal_id: "fixture-unknown-entry-001",
      status: "UNKNOWN",
      submitted_at: Date.now() / 1000,
    },
  ],
  actions: [
    {
      id: "fixture-partial-001",
      identifier: 9000,
      kind: "PARTIAL",
      status: "UNKNOWN",
      created_at: Date.now() / 1000,
      response_json: null,
    },
  ],
  positions: [
    {
      identifier: 9000,
      signal_id: "fixture-signal-001",
      symbol: "XAUUSD",
      side: 0,
      initial_volume: 0.02,
      status: "ACTIVE",
    },
  ],
  audit: [],
};
const results = new Map<string, object>();
window.fetch = async (input, init) => {
  const url = String(input);
  if (url === "http://localhost:1/lifecycle" && !init?.method)
    return new Response(JSON.stringify(fixture));
  if (
    url !== "http://localhost:1/operator/reconcile" ||
    init?.method !== "POST"
  )
    throw new Error("Fixture blocks all network and trading requests");
  const action = JSON.parse(String(init.body)) as OperatorAction;
  if (results.has(action.operation_id))
    return new Response(JSON.stringify(results.get(action.operation_id)));
  if (action.broker_ticket !== 9001 && action.kind !== "RESET_DRAWDOWN")
    return new Response(
      JSON.stringify({
        detail: "Fixture: wrong order ticket. Test evidence uses 9001.",
      }),
      { status: 409 },
    );
  if (action.kind === "RESET_DRAWDOWN")
    return new Response(
      JSON.stringify({
        detail:
          "Fixture: account must be confirmed flat before drawdown review",
      }),
      { status: 409 },
    );
  const result =
    action.kind === "ENTRY"
      ? { status: "FILLED", evidence: { ticket: 9001, volume: 0.02 } }
      : { status: "CONFIRMED" };
  if (action.kind === "ENTRY") fixture.requests = [];
  else fixture.actions[0].status = "CONFIRMED";
  fixture.audit.unshift({
    operation_id: action.operation_id,
    timestamp: Date.now() / 1000,
    kind: action.kind,
    entity: action.entity,
    reason: action.reason,
  });
  results.set(action.operation_id, result);
  return new Response(JSON.stringify(result));
};

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <main className="mx-auto max-w-5xl p-4 text-white">
      <h1 className="mb-4 text-lg font-bold text-amber-300">
        UI test fixture — NO broker connection
      </h1>
      <p className="mb-4 text-xs text-slate-400">
        In-memory evidence only. Test order ticket: 9001. This page cannot send
        an order.
      </p>
      <section className="rounded-2xl border border-white/10 bg-[#101318] p-4">
        <LifecyclePanel
          url="http://localhost:1"
          secret="fixture-not-a-secret"
          connected
          accountId={account}
          onReconciled={() => {}}
        />
      </section>
    </main>
  </React.StrictMode>,
);
