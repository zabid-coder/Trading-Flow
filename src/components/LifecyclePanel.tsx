import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchLifecycle,
  reconcileLifecycle,
  type LifecycleStatus,
  type OperatorAction,
  type OperatorResult,
} from "../engine/lifecycle";

type Target = {
  kind: OperatorAction["kind"];
  entity: string;
  title: string;
  needsTicket: boolean;
};

export default function LifecyclePanel({
  url,
  secret,
  accountId,
  connected,
  onReconciled,
}: {
  url: string;
  secret: string;
  accountId: string;
  connected: boolean;
  onReconciled: (action: OperatorAction, result: OperatorResult) => void;
}) {
  const [status, setStatus] = useState<LifecycleStatus | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState<Target | null>(null);
  const [ticket, setTicket] = useState("");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkedAt, setCheckedAt] = useState(0);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const lastOperation = useRef<{
    fingerprint: string;
    operation: OperatorAction;
  } | null>(null);

  const refresh = useCallback(async () => {
    const current = generation.current;
    try {
      const next = await fetchLifecycle(url, secret, accountId);
      if (current !== generation.current) return;
      setStatus(next);
      setCheckedAt(Date.now());
      setError("");
    } catch (e) {
      if (current !== generation.current) return;
      setStatus(null);
      setCheckedAt(0);
      setError(e instanceof Error ? e.message : "Lifecycle unavailable");
    }
  }, [url, secret, accountId]);

  useEffect(() => {
    generation.current++;
    setStatus(null);
    setTarget(null);
    setError("");
    setMessage("");
    setReason("");
    setTicket("");
    setConfirmation("");
    lastOperation.current = null;
    if (!connected || !accountId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh();
      if (!cancelled) timer = setTimeout(poll, 10_000);
    };
    void poll();
    return () => {
      cancelled = true;
      generation.current++;
      clearTimeout(timer);
    };
  }, [connected, accountId, refresh]);

  const choose = (next: Target) => {
    setTarget(next);
    setTicket("");
    setReason("");
    setConfirmation("");
    setMessage("");
    lastOperation.current = null;
  };
  const canReview = Boolean(
    status?.source === "MT5" &&
      status.account_mode === "DEMO" &&
      status.operator_enabled &&
      !busy,
  );
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!status || !target || !canReview || inFlight.current) return;
    const current = generation.current;
    const fields = {
      account_id: accountId,
      confirm_account_id: confirmation,
      kind: target.kind,
      entity: target.entity,
      broker_ticket: ticket.trim() ? Number(ticket) : null,
      reason: reason.trim(),
    };
    const fingerprint = JSON.stringify(fields);
    if (lastOperation.current?.fingerprint !== fingerprint)
      lastOperation.current = {
        fingerprint,
        operation: { ...fields, operation_id: crypto.randomUUID() },
      };
    const action = lastOperation.current.operation;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      // Recheck identity and mode immediately before an audited ledger write.
      const fresh = await fetchLifecycle(url, secret, accountId);
      if (current !== generation.current) return;
      const result = await reconcileLifecycle(url, secret, fresh, action);
      if (current !== generation.current) return;
      onReconciled(action, result);
      setMessage(
        `Review recorded: ${result.status}. No broker order was sent by this review.`,
      );
      setTarget(null);
      lastOperation.current = null;
      await refresh();
    } catch (e) {
      if (current === generation.current)
        setMessage(
          e instanceof Error
            ? e.message
            : "Review outcome unavailable. Refresh evidence before continuing.",
        );
      // Preserve the operation ID after a timeout. The same review is idempotent.
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  if (!connected)
    return (
      <p className="text-xs leading-relaxed text-slate-400">
        Connect MT5 monitoring to inspect the host exit worker, owned positions
        and recovery ledger. Paper simulation does not run broker management.
      </p>
    );

  const unknownActions =
    status?.actions.filter((a) => ["SENDING", "UNKNOWN"].includes(a.status)) ??
    [];
  const inputClass =
    "mt-1 w-full min-w-0 rounded-lg border border-white/15 bg-black/30 p-2 font-mono text-xs text-white";
  const buttonClass =
    "rounded-lg border border-amber-400/30 px-3 py-2 text-xs font-semibold text-amber-200 disabled:opacity-40";
  return (
    <div className="space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p
            className={
              status?.worker.healthy
                ? "font-bold text-emerald-300"
                : "font-bold text-amber-300"
            }
          >
            {status?.worker.healthy
              ? "Host exit worker ready"
              : "Host exit worker unavailable / locked"}
          </p>
          <p className="mt-1 break-all font-mono text-[10px] text-slate-500">
            {accountId}
          </p>
        </div>
        <button
          className={buttonClass}
          disabled={busy}
          onClick={() => void refresh()}
        >
          Refresh evidence
        </button>
      </div>
      <p className="leading-relaxed text-slate-400">
        Breakeven, trailing stops and one-shot partial closes run on the demo
        bridge host using entry-time policy. Keep that host and terminal
        running. Initial SL/TP stay with the broker; browser pause/disconnect
        does not stop the worker.
      </p>
      <p className="text-[10px] text-slate-500">
        Breakeven is price-based; fees, gaps and slippage can still cause a
        loss.
      </p>
      {error && (
        <p role="alert" className="text-rose-300">
          {error}
        </p>
      )}
      {status && (
        <>
          {!status.worker.healthy && (
            <p className="text-amber-300">
              {status.worker.last_error ||
                "Demo execution disabled or worker heartbeat stale"}
            </p>
          )}
          <p className="text-[10px] text-slate-500">
            Snapshot{" "}
            {checkedAt ? new Date(checkedAt).toLocaleTimeString() : "—"} ·{" "}
            {status.positions.filter((p) => p.status === "ACTIVE").length}{" "}
            tracked position(s) ·{" "}
            {status.requests.length + unknownActions.length} unresolved
            submission(s)
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="min-w-0 rounded-xl border border-white/10 p-3">
              <h3 className="mb-3 font-semibold text-white">
                Unresolved submissions
              </h3>
              {!status.requests.length && !unknownActions.length && (
                <p className="text-slate-500">
                  No unresolved server-ledger submissions.
                </p>
              )}
              <div className="space-y-3">
                {status.requests.map((r) => (
                  <div key={r.signal_id} className="space-y-2">
                    <p className="break-all font-mono text-[10px] text-amber-200">
                      ENTRY · {r.status} · {r.signal_id}
                    </p>
                    <button
                      className={buttonClass}
                      disabled={!canReview}
                      onClick={() =>
                        choose({
                          kind: "ENTRY",
                          entity: r.signal_id,
                          title: "Reconcile entry",
                          needsTicket: true,
                        })
                      }
                    >
                      Review entry evidence
                    </button>
                  </div>
                ))}
                {unknownActions.map((a) => (
                  <div key={a.id} className="space-y-2">
                    <p className="break-all font-mono text-[10px] text-amber-200">
                      {a.kind} · {a.status} · position #{a.identifier}
                    </p>
                    <button
                      className={buttonClass}
                      disabled={!canReview}
                      onClick={() =>
                        choose({
                          kind: "MANAGEMENT",
                          entity: a.id,
                          title: `Reconcile ${a.kind.toLowerCase()}`,
                          needsTicket: a.kind === "PARTIAL",
                        })
                      }
                    >
                      Review exit evidence
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="min-w-0 rounded-xl border border-white/10 p-3">
              <h3 className="mb-2 font-semibold text-white">
                Drawdown latch review
              </h3>
              <p className="mb-3 leading-relaxed text-slate-400">
                Requires a flat account, no unknown submissions and recovered
                equity below 70% of the drawdown limit. Preserves the high-water
                mark and daily-loss latch. This is not a risk-budget reset.
              </p>
              <button
                className={buttonClass}
                disabled={!canReview}
                onClick={() =>
                  choose({
                    kind: "RESET_DRAWDOWN",
                    entity: "drawdown",
                    title: "Review recovered drawdown latch",
                    needsTicket: false,
                  })
                }
              >
                Review drawdown latch
              </button>
            </div>
          </div>
          {target && (
            <form
              onSubmit={submit}
              className="space-y-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.03] p-4"
            >
              <h3 className="font-bold text-amber-200">{target.title}</h3>
              <p className="break-all text-[10px] text-slate-500">
                {target.entity}
              </p>
              {target.needsTicket && (
                <label className="block text-slate-300">
                  Exact MT5 order ticket (not deal ticket)
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    pattern="[0-9]+"
                    required
                    value={ticket}
                    onChange={(e) => setTicket(e.target.value)}
                    disabled={busy}
                  />
                </label>
              )}
              <label className="block text-slate-300">
                Review reason (minimum 15 characters)
                <textarea
                  className={inputClass}
                  required
                  minLength={15}
                  maxLength={500}
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="block break-all text-slate-300">
                Type account ID: {accountId}
                <input
                  className={inputClass}
                  autoComplete="off"
                  required
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  disabled={busy}
                />
              </label>
              <p className="text-[10px] leading-relaxed text-slate-400">
                Only conclusive broker evidence can clear an unknown outcome.
                Missing evidence remains locked. A review never resubmits the
                original order. The worker may resume normal protection after
                successful reconciliation.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className={buttonClass}
                  disabled={
                    !canReview ||
                    confirmation !== accountId ||
                    reason.trim().length < 15 ||
                    (target.needsTicket && !ticket.trim())
                  }
                >
                  {busy ? "Checking evidence…" : "Record evidence review"}
                </button>
                <button
                  type="button"
                  className="px-3 py-2 text-slate-400"
                  disabled={busy}
                  onClick={() => setTarget(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          <div className="rounded-xl border border-white/10 p-3">
            <h3 className="mb-2 font-semibold text-slate-300">
              Verified position ledger
            </h3>
            <div className="max-h-36 space-y-2 overflow-y-auto font-mono text-[10px] text-slate-400">
              {!status.positions.length && (
                <p>
                  No receipt-verified positions. Manual and other-EA positions
                  are never adopted.
                </p>
              )}
              {status.positions.map((p) => (
                <p key={p.identifier} className="break-words">
                  #{p.identifier} · {p.symbol} {p.side === 0 ? "BUY" : "SELL"} ·
                  initial {p.initial_volume} lots · {p.status}
                </p>
              ))}
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0">
              <h3 className="mb-2 font-semibold text-slate-300">
                Recent management actions
              </h3>
              <div className="max-h-48 space-y-2 overflow-y-auto font-mono text-[10px] text-slate-400">
                {!status.actions.length && (
                  <p>No host management actions yet.</p>
                )}
                {status.actions.slice(0, 12).map((a) => (
                  <p key={a.id}>
                    #{a.identifier} · {a.kind} ·{" "}
                    <span
                      className={a.status === "UNKNOWN" ? "text-amber-300" : ""}
                    >
                      {a.status}
                    </span>
                    {a.detail && (
                      <span className="mt-1 block break-words text-slate-500">
                        {a.detail}
                      </span>
                    )}
                  </p>
                ))}
              </div>
            </div>
            <div className="min-w-0">
              <h3 className="mb-2 font-semibold text-slate-300">
                Operator audit
              </h3>
              <div className="max-h-48 space-y-2 overflow-y-auto text-[10px] text-slate-400">
                {!status.audit.length && <p>No recorded operator reviews.</p>}
                {status.audit.map((a) => (
                  <div key={a.operation_id}>
                    <p className="font-mono">
                      {new Date(a.timestamp * 1000).toLocaleString()} · {a.kind}
                    </p>
                    <p className="break-words">{a.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
      {message && (
        <p
          role="status"
          className="break-words rounded-lg bg-white/5 p-3 text-amber-100"
        >
          {message}
        </p>
      )}
    </div>
  );
}
