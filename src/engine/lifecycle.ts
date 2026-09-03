import { BridgeError, bridgeRequest } from "./brokerDispatch";

export interface LifecycleStatus {
  account_id: string;
  account_mode: "DEMO" | "REAL" | "UNKNOWN";
  source: "MT5" | "MOCK";
  operator_enabled: boolean;
  worker: {
    healthy: boolean;
    last_tick: number;
    last_error: string;
    account_id: string;
  };
  requests: {
    signal_id: string;
    status: string;
    submitted_at: number | null;
  }[];
  actions: {
    id: string;
    identifier: number;
    kind: "SLTP" | "PARTIAL";
    status: string;
    created_at: number;
    response_json: string | null;
    detail?: string;
  }[];
  positions: {
    identifier: number;
    signal_id: string;
    symbol: string;
    side: number;
    initial_volume: number;
    status: string;
  }[];
  audit: {
    operation_id: string;
    timestamp: number;
    kind: string;
    entity: string;
    reason: string;
  }[];
}

export interface OperatorAction {
  operation_id: string;
  account_id: string;
  confirm_account_id: string;
  kind: "ENTRY" | "MANAGEMENT" | "RESET_DRAWDOWN";
  entity: string;
  broker_ticket: number | null;
  reason: string;
}

export interface OperatorResult {
  status: "FILLED" | "REJECTED" | "CONFIRMED" | "REVIEWED";
  evidence?: { ticket?: number; broker_ticket?: number; volume?: number };
  peak_preserved?: number;
  daily_lock_preserved?: boolean;
}

export async function fetchLifecycle(
  url: string,
  secret: string,
  accountId: string,
): Promise<LifecycleStatus> {
  const d = await bridgeRequest(url, secret, "/lifecycle");
  if (
    !d ||
    d.account_id !== accountId ||
    !["MT5", "MOCK"].includes(d.source) ||
    !["DEMO", "REAL", "UNKNOWN"].includes(d.account_mode) ||
    typeof d.operator_enabled !== "boolean" ||
    typeof d.worker?.healthy !== "boolean" ||
    !Number.isFinite(d.worker.last_tick) ||
    typeof d.worker.last_error !== "string" ||
    typeof d.worker.account_id !== "string" ||
    !Array.isArray(d.requests) ||
    !Array.isArray(d.actions) ||
    !Array.isArray(d.positions) ||
    !Array.isArray(d.audit) ||
    d.requests.some(
      (r: LifecycleStatus["requests"][number]) =>
        typeof r?.signal_id !== "string" ||
        !["SENDING", "UNKNOWN"].includes(r.status),
    ) ||
    d.actions.some(
      (r: LifecycleStatus["actions"][number]) =>
        typeof r?.id !== "string" ||
        !Number.isSafeInteger(r.identifier) ||
        (r.detail !== undefined && typeof r.detail !== "string") ||
        !["SLTP", "PARTIAL"].includes(r.kind) ||
        !["SENDING", "UNKNOWN", "CONFIRMED", "REJECTED", "SKIPPED"].includes(
          r.status,
        ),
    ) ||
    d.positions.some(
      (r: LifecycleStatus["positions"][number]) =>
        !Number.isSafeInteger(r?.identifier) ||
        typeof r.symbol !== "string" ||
        !["ACTIVE", "CLOSED"].includes(r.status) ||
        ![0, 1].includes(r.side) ||
        !Number.isFinite(r.initial_volume) ||
        r.initial_volume <= 0,
    ) ||
    d.audit.some(
      (r: LifecycleStatus["audit"][number]) =>
        typeof r?.operation_id !== "string" ||
        typeof r.reason !== "string" ||
        typeof r.kind !== "string" ||
        !Number.isFinite(r.timestamp),
    )
  )
    throw new BridgeError(
      "Lifecycle evidence invalid or account changed — reconnect",
    );
  return d;
}

export async function reconcileLifecycle(
  url: string,
  secret: string,
  context: LifecycleStatus,
  action: OperatorAction,
): Promise<OperatorResult> {
  if (
    context.source !== "MT5" ||
    context.account_mode !== "DEMO" ||
    !context.operator_enabled ||
    context.account_id !== action.account_id ||
    action.confirm_account_id !== action.account_id ||
    action.reason.trim().length < 15 ||
    action.reason.length > 500 ||
    (action.broker_ticket !== null &&
      (!Number.isSafeInteger(action.broker_ticket) ||
        action.broker_ticket <= 0)) ||
    (action.kind === "ENTRY" && !action.broker_ticket)
  )
    throw new BridgeError(
      "Recovery requires a host-enabled demo account, exact account confirmation and review evidence",
    );
  // This endpoint changes the durable ledger only. It never submits a broker order.
  const d = await bridgeRequest(url, secret, "/operator/reconcile", {
    method: "POST",
    body: JSON.stringify(action),
  });
  const allowed =
    action.kind === "ENTRY"
      ? ["FILLED", "REJECTED"]
      : action.kind === "MANAGEMENT"
        ? ["CONFIRMED", "REJECTED"]
        : ["REVIEWED"];
  if (
    !d ||
    !allowed.includes(d.status) ||
    (d.status === "FILLED" &&
      (!Number.isSafeInteger(d.evidence?.ticket) ||
        d.evidence.ticket <= 0 ||
        !Number.isFinite(d.evidence.volume) ||
        d.evidence.volume <= 0))
  )
    throw new BridgeError(
      "Recovery response incomplete; refresh evidence or retry the same review operation",
    );
  return d;
}
