"""Durable, demo-only position management and evidence-based reconciliation.

No trading occurs on import. The owning bridge supplies the broker, database,
authorization policy and lock. Unknown effects are never retried automatically.
"""
import hashlib
import json
import math
import time

from fastapi import HTTPException


def init_schema(conn):
    columns = {row[1] for row in conn.execute("PRAGMA table_info(safe_requests)")}
    for name, sql_type in (("request_json", "TEXT"), ("submitted_at", "REAL")):
        if name not in columns:
            conn.execute(f"ALTER TABLE safe_requests ADD COLUMN {name} {sql_type}")
    conn.execute("""CREATE TABLE IF NOT EXISTS safe_positions (
        account TEXT NOT NULL, identifier INTEGER NOT NULL, signal_id TEXT NOT NULL,
        symbol TEXT NOT NULL, side INTEGER NOT NULL, initial_volume REAL NOT NULL,
        entry REAL NOT NULL, policy TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ACTIVE',
        PRIMARY KEY(account, identifier))""")
    conn.execute("""CREATE TABLE IF NOT EXISTS safe_actions (
        id TEXT PRIMARY KEY, account TEXT NOT NULL, identifier INTEGER NOT NULL,
        kind TEXT NOT NULL, status TEXT NOT NULL, request_json TEXT NOT NULL,
        created_at REAL NOT NULL, response_json TEXT)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS safe_operator_audit (
        operation_id TEXT PRIMARY KEY, account TEXT NOT NULL, fingerprint TEXT NOT NULL,
        timestamp REAL NOT NULL, kind TEXT NOT NULL, entity TEXT NOT NULL,
        reason TEXT NOT NULL, result TEXT NOT NULL)""")


def positive(*values):
    return all(isinstance(v, (int, float)) and math.isfinite(v) and v > 0 for v in values)


def plan_management(position, info, tick, policy, initial_volume, partial_attempted):
    """Pure tick-based planner. SL can tighten only; TP is never silently replaced."""
    if position.type not in (0, 1) or not positive(position.price_open, position.volume, info.point,
            info.trade_tick_size, info.volume_min, info.volume_step, tick.bid, tick.ask):
        raise ValueError("Invalid broker position/contract")
    if tick.ask < tick.bid or not -2 <= time.time() - float(getattr(tick, "time", 0)) <= 15:
        raise ValueError("Management quote stale or crossed")
    if not positive(position.sl, position.tp):
        raise ValueError("Protective SL/TP missing; operator review required")
    buy = position.type == 0
    direction = 1 if buy else -1
    quote = tick.bid if buy else tick.ask
    favorable = direction * (quote - position.price_open)
    scale = .1 if policy["auto_adjust_two_digit_gold"] and info.digits == 2 and position.symbol.startswith("XAU") else 1.
    distance = lambda key: float(policy[key]) * info.point * scale
    if any(not math.isfinite(float(v)) for v in policy.values() if isinstance(v, (int, float))):
        raise ValueError("Invalid persisted management policy")
    broker_distance = (max(info.trade_stops_level, info.trade_freeze_level) + policy["broker_stop_buffer_points"]) * info.point
    candidate = position.sl
    reasons = []
    if favorable >= distance("breakeven_start_points"):
        candidate = position.price_open + direction * distance("breakeven_offset_points")
        reasons.append("BREAKEVEN")
    if favorable >= distance("trailing_start_points"):
        trailing = quote - direction * distance("trailing_step_points")
        candidate = max(candidate, trailing) if buy else min(candidate, trailing)
        reasons.append("TRAILING")
    # Round towards the permitted side of the quote, then require a full tick improvement.
    if buy:
        candidate = math.floor(min(candidate, quote - broker_distance) / info.trade_tick_size + 1e-9) * info.trade_tick_size
        better = candidate >= position.sl + info.trade_tick_size - 1e-9
    else:
        candidate = math.ceil(max(candidate, quote + broker_distance) / info.trade_tick_size - 1e-9) * info.trade_tick_size
        better = candidate <= position.sl - info.trade_tick_size + 1e-9
    # Do not request SLTP while the existing stop/target is frozen or already crossed.
    freeze = info.trade_freeze_level * info.point
    frozen = direction * (quote - position.sl) <= freeze or direction * (position.tp - quote) <= freeze
    new_sl = round(candidate, info.digits) if better and not frozen and candidate > 0 else None
    partial = None
    skip = None
    if not partial_attempted and favorable >= distance("partial_tp_points") and not frozen:
        desired = initial_volume * float(policy["partial_close_percent"]) / 100
        volume = round(math.floor((desired + 1e-12) / info.volume_step) * info.volume_step, 8)
        remaining = round(position.volume - volume, 8)
        if volume < info.volume_min - 1e-9 or remaining < info.volume_min - 1e-9:
            skip = "Minimum lot prevents a valid partial and remainder"
        elif any(abs(v/info.volume_step-round(v/info.volume_step)) > 1e-6 for v in (volume, remaining)):
            skip = "Partial or remainder is off the broker volume-step grid"
        elif not 0 < volume < position.volume:
            skip = "Partial volume would close or reverse the position"
        else:
            partial = volume
    return {"sl": new_sl, "tp": position.tp, "partial_volume": partial, "partial_skip": skip,
            "reason": "+".join(reasons) or "WAIT", "quote": quote}


class BrokerLifecycle:
    def __init__(self, bridge):
        self.b = bridge

    def _account(self, key=None, require_demo=True):
        account = self.b.connected_account()
        if key is not None and self.b.account_key(account) != key:
            raise HTTPException(409, "Broker account changed")
        if require_demo and not self.b.demo_authorized(account):
            raise HTTPException(423, "Lifecycle writes are restricted to the host-enabled DEMO account")
        return account

    def _positions(self):
        positions = self.b.mt5.positions_get()
        if positions is None:
            raise HTTPException(503, "Position snapshot unavailable")
        return positions

    def _position(self, identifier):
        matches = [p for p in self._positions() if getattr(p, "identifier", p.ticket) == identifier]
        if len(matches) > 1:
            raise HTTPException(409, "Position identity is ambiguous")
        return matches[0] if matches else None

    def _deals(self, identifier):
        getter = getattr(self.b.mt5, "history_deals_get", None)
        if not getter: raise HTTPException(503, "Deal history API unavailable")
        deals = getter(position=int(identifier))
        if deals is None: raise HTTPException(503, "Position deal history unavailable")
        return deals

    def _closed_proof(self, identifier):
        deals = self._deals(identifier)
        entries = sum(float(d.volume) for d in deals if d.entry == 0 and d.type in (0, 1))
        exits = sum(float(d.volume) for d in deals if d.entry in (1, 3) and d.type in (0, 1))
        return entries > 0 and exits + 1e-8 >= entries and self._position(identifier) is None

    def _owned(self, position, tracked):
        if position is None: return False
        policy = json.loads(tracked["policy"])
        return position.symbol == tracked["symbol"] and position.type == tracked["side"] and \
            position.magic == policy["magic_number"] and \
            abs(position.price_open - tracked["entry"]) <= policy["tick_size"] * .51 and \
            0 < position.volume <= tracked["initial_volume"] + 1e-8

    def discover_positions(self, key):
        """Adopt only a full receipt plus exact broker comment/magic/identity proof."""
        positions = self._positions()
        with self.b.get_db() as conn:
            rows = conn.execute("SELECT * FROM safe_requests WHERE account=? AND status='FILLED' AND request_json IS NOT NULL", (key,)).fetchall()
            for row in rows:
                envelope = json.loads(row["request_json"])
                request, policy = envelope["request"], envelope["policy"]
                receipt = json.loads(row["receipt"])
                for p in positions:
                    identifier = int(getattr(p, "identifier", p.ticket))
                    if p.symbol != request["symbol"] or p.magic != request["magic"] or p.type != request["type"]:
                        continue
                    # Most accounts use opening order ticket as stable identifier;
                    # where they don't, only an exact entry-deal association suffices.
                    identity_matches = identifier == receipt["ticket"]
                    if not identity_matches:
                        identity_matches = any(d.order == receipt["ticket"] and d.position_id == identifier and d.entry == 0 for d in self._deals(identifier))
                    if not identity_matches or getattr(p, "comment", "") != request["comment"]:
                        continue
                    if not positive(p.volume, p.price_open) or p.volume > receipt["volume"] + 1e-8:
                        continue
                    conn.execute("""INSERT OR IGNORE INTO safe_positions
                        (account,identifier,signal_id,symbol,side,initial_volume,entry,policy)
                        VALUES (?,?,?,?,?,?,?,?)""", (key, identifier, row["signal_id"], p.symbol, p.type,
                            receipt["volume"], receipt["fill_price"], json.dumps(policy)))

    def run_once(self):
        with self.b.MT5_LOCK:
            account = self._account()
            key = self.b.account_key(account)
            self.discover_positions(key)
            with self.b.get_db() as conn:
                tracked = conn.execute("SELECT * FROM safe_positions WHERE account=? AND status='ACTIVE'", (key,)).fetchall()
            for row in tracked:
                self._manage(key, row)
            return {"account_id": key, "tracked": len(tracked)}

    def _manage(self, key, tracked, allow_stop=True):
        identifier = tracked["identifier"]
        position = self._position(identifier)
        if position is None:
            if self._closed_proof(identifier):
                with self.b.get_db() as conn:
                    conn.execute("UPDATE safe_positions SET status='CLOSED' WHERE account=? AND identifier=?", (key, identifier))
            return
        if not self._owned(position, tracked):
            raise HTTPException(409, "Owned position was changed externally — management paused")
        policy = json.loads(tracked["policy"])
        info, tick = self.b.mt5.symbol_info(position.symbol), self.b.mt5.symbol_info_tick(position.symbol)
        if info is None or tick is None: raise HTTPException(503, "Management quote/contract unavailable")
        if info.point != policy["point"] or info.trade_tick_size != policy["tick_size"]:
            raise HTTPException(409, "Broker contract changed since entry")
        with self.b.get_db() as conn:
            pending = conn.execute("SELECT 1 FROM safe_actions WHERE account=? AND identifier=? AND status IN ('SENDING','UNKNOWN')", (key, identifier)).fetchone()
            attempted = conn.execute("SELECT 1 FROM safe_actions WHERE account=? AND identifier=? AND kind='PARTIAL'", (key, identifier)).fetchone()
        if pending: return
        try:
            plan = plan_management(position, info, tick, policy, tracked["initial_volume"], bool(attempted))
        except ValueError as error:
            raise HTTPException(503, str(error))
        if plan["sl"] is not None and allow_stop:
            request = dict(action=getattr(self.b.mt5, "TRADE_ACTION_SLTP", 6), position=position.ticket,
                           symbol=position.symbol, sl=plan["sl"], tp=plan["tp"], magic=policy["magic_number"])
            self._submit(key, tracked, "SLTP", request, position.volume)
            # Fresh position/quote after SL acknowledgement. Limit recursion to one
            # pass so a moving trailing stop cannot starve the one-shot partial.
            self._manage(key, tracked, allow_stop=False)
            return
        if plan["partial_skip"]:
            action_id = self._action_id(key, identifier, "PARTIAL", {})
            with self.b.get_db() as conn:
                conn.execute("INSERT OR IGNORE INTO safe_actions VALUES (?,?,?,?,?,?,?,?)", (action_id, key, identifier,
                    "PARTIAL", "SKIPPED", json.dumps({"reason": plan["partial_skip"]}), time.time(), None))
        elif plan["partial_volume"] is not None:
            # RETURN can leave a residual order. Automatic partial closes use only FOK/IOC.
            if info.filling_mode & 1: filling = self.b.mt5.ORDER_FILLING_FOK
            elif info.filling_mode & 2: filling = self.b.mt5.ORDER_FILLING_IOC
            else: raise HTTPException(422, "Broker lacks FOK/IOC for safe partial close")
            request = dict(action=self.b.mt5.TRADE_ACTION_DEAL, position=position.ticket, symbol=position.symbol,
                           type=1-position.type, volume=plan["partial_volume"], price=plan["quote"],
                           deviation=policy["max_deviation_points"], magic=policy["magic_number"],
                           type_time=self.b.mt5.ORDER_TIME_GTC, type_filling=filling)
            self._submit(key, tracked, "PARTIAL", request, position.volume)

    @staticmethod
    def _action_id(key, identifier, kind, request):
        identity = f"{key}:{identifier}:{kind}" + (f":{request['sl']}:{request['tp']}" if kind == "SLTP" else "")
        return hashlib.sha256(identity.encode()).hexdigest()

    def _submit(self, key, tracked, kind, request, before_volume):
        identifier = tracked["identifier"]
        action_id = self._action_id(key, identifier, kind, request)
        request["comment"] = "SSM:" + action_id[:20]
        policy = json.loads(tracked["policy"])
        with self.b.get_db() as conn:
            conn.execute("BEGIN IMMEDIATE")
            if conn.execute("SELECT 1 FROM safe_actions WHERE id=?", (action_id,)).fetchone(): return
            if conn.execute("SELECT 1 FROM safe_actions WHERE account=? AND identifier=? AND status IN ('SENDING','UNKNOWN')", (key, identifier)).fetchone(): return
            # Revalidate after taking the cross-worker database lock.
            self._account(key)
            position = self._position(identifier)
            if not self._owned(position, tracked) or position.ticket != request["position"] or abs(position.volume-before_volume) > 1e-8:
                raise HTTPException(409, "Position changed before management submission")
            if kind == "SLTP":
                direction = 1 if position.type == 0 else -1
                if direction*(request["sl"]-position.sl) <= policy["tick_size"]*.5 or request["tp"] != position.tp:
                    return  # Another worker/operator already tightened the stop.
            elif request["type"] == position.type or not 0 < request["volume"] < position.volume:
                raise HTTPException(409, "Close could increase or reverse exposure")
            checker = getattr(self.b.mt5, "order_check", None)
            check = checker(request) if checker else None
            if check is None or check.retcode != 0:
                raise HTTPException(422, "Management OrderCheck did not pass")
            envelope = {"request": request, "before_volume": before_volume, "side": position.type}
            conn.execute("INSERT INTO safe_actions VALUES (?,?,?,?,?,?,?,NULL)", (action_id, key, identifier, kind, "SENDING", json.dumps(envelope), time.time()))
        try:
            # Check account once more immediately before the only side effect.
            self._account(key)
            result = self.b.mt5.order_send(request)
        except Exception:
            result = None
        result_code = getattr(result, "retcode", None)
        state = "UNKNOWN"
        evidence = {"retcode": result_code}
        if kind == "SLTP" and result_code in (10009, 10025):
            actual = self._position(identifier)
            direction = 1 if tracked["side"] == 0 else -1
            if actual and self._owned(actual, tracked) and direction*(actual.sl-request["sl"]) >= -policy["tick_size"]*.5:
                state = "CONFIRMED"
        elif kind == "PARTIAL" and result_code in (10009, 10010):
            filled = float(getattr(result, "volume", 0))
            # Even a smaller IOC fill consumes this one-shot TP1. Never resend the residual.
            actual = self._position(identifier)
            if positive(filled) and filled <= request["volume"] + 1e-8 and \
                    int(getattr(result, "order", 0)) > 0 and actual and self._owned(actual, tracked) and \
                    abs(actual.volume - (before_volume-filled)) < 1e-8:
                state = "CONFIRMED"
                evidence.update(volume=filled, order=getattr(result, "order", 0), deal=getattr(result, "deal", 0))
        elif result_code in (10004, 10006, 10013, 10014, 10015, 10016, 10017, 10018, 10019, 10020, 10021, 10030):
            state = "REJECTED"
        with self.b.get_db() as conn:
            conn.execute("UPDATE safe_actions SET status=?,response_json=? WHERE id=? AND status='SENDING'", (state, json.dumps(evidence), action_id))

    def status(self):
        with self.b.MT5_LOCK:
            account = self._account(require_demo=False)
            key = self.b.account_key(account)
            with self.b.get_db() as conn:
                requests = conn.execute("SELECT signal_id,status,receipt,submitted_at FROM safe_requests WHERE account=? AND status IN ('SENDING','UNKNOWN')", (key,)).fetchall()
                actions = conn.execute("""SELECT id,identifier,kind,status,created_at,response_json,request_json FROM safe_actions WHERE account=?
                    ORDER BY (status IN ('SENDING','UNKNOWN')) DESC, created_at DESC LIMIT 100""", (key,)).fetchall()
                positions = conn.execute("SELECT identifier,signal_id,symbol,side,initial_volume,status FROM safe_positions WHERE account=? ORDER BY rowid DESC LIMIT 50", (key,)).fetchall()
                audit = conn.execute("SELECT operation_id,timestamp,kind,entity,reason FROM safe_operator_audit WHERE account=? ORDER BY timestamp DESC LIMIT 20", (key,)).fetchall()
            worker = dict(self.b.MANAGEMENT_STATE)
            worker["healthy"] = self.b.execution_enabled(account)
            action_views = []
            for row in actions:
                item = dict(row)
                item["detail"] = json.loads(item.pop("request_json")).get("reason", "")
                action_views.append(item)
            return {"account_id": key, "account_mode": self.b.account_mode(account), "source": "MT5" if self.b.MT5_AVAILABLE else "MOCK",
                    "operator_enabled": self.b.demo_authorized(account), "worker": worker,
                    "requests": [dict(r) for r in requests], "actions": action_views,
                    "positions": [dict(r) for r in positions], "audit": [dict(r) for r in audit]}

    def _request_evidence(self, row, ticket):
        if not row["request_json"]:
            raise HTTPException(409, "Legacy request lacks ownership evidence; cannot automatically clear")
        envelope = json.loads(row["request_json"])
        request = envelope["request"]
        getter = getattr(self.b.mt5, "history_orders_get", None)
        if not getter: raise HTTPException(503, "Broker order history unavailable")
        orders = getter(ticket=ticket)
        if orders is None: raise HTTPException(503, "Broker order lookup failed")
        if len(orders) != 1: raise HTTPException(409, "Exactly one historical broker order must match")
        order = orders[0]
        if order.ticket != ticket or order.symbol != request["symbol"] or order.magic != request["magic"] or order.type != request["type"] or order.comment != request["comment"]:
            raise HTTPException(409, "Ticket belongs to a different order; ownership mismatch")
        if getattr(order, "state", -1) not in (2, 4, 5, 6):
            raise HTTPException(409, "Order is not in a final broker state")
        deals = self.b.mt5.history_deals_get(ticket=ticket)
        if deals is None: raise HTTPException(503, "Order deal lookup failed")
        deals = [d for d in deals if d.order == ticket and d.entry == 0 and d.type == request["type"] and d.symbol == request["symbol"]]
        if not deals:
            if order.state not in (2, 5, 6): raise HTTPException(409, "Filled order has no confirming deal evidence")
            return "REJECTED", {"broker_ticket": ticket, "broker_state": order.state}
        volume = sum(float(d.volume) for d in deals)
        if not positive(volume) or volume > request["volume"] + 1e-8 or any(not positive(d.price,d.volume) for d in deals):
            raise HTTPException(409, "Broker fill volume/price evidence invalid")
        receipt = {"status":"FILLED", "signal_id":row["signal_id"], "ticket":ticket, "volume":volume,
                   "fill_price":sum(d.price*d.volume for d in deals)/volume, "sl":request["sl"], "tp":request["tp"],
                   "estimated_loss":envelope["estimated_loss"], "margin_required":envelope["margin_required"],
                   "account_id":row["account"], "account_mode":"DEMO", "source":"MT5"}
        return "FILLED", receipt

    def _action_evidence(self, row, ticket):
        envelope = json.loads(row["request_json"])
        request = envelope["request"]
        position = self._position(row["identifier"])
        if row["kind"] == "SLTP":
            direction = 1 if envelope["side"] == 0 else -1
            if position and position.type == envelope["side"] and position.symbol == request["symbol"] and position.magic == request["magic"] and direction*(position.sl-request["sl"]) >= -1e-9:
                return "CONFIRMED", {"observed_stop": position.sl, "ticket": position.ticket}
            if position is None and self._closed_proof(row["identifier"]):
                return "CONFIRMED", {"position_closed": True}
            raise HTTPException(409, "Broker state does not confirm the requested protection")
        getter = getattr(self.b.mt5, "history_orders_get", None)
        orders = getter(ticket=ticket) if getter and ticket else None
        if orders is None: raise HTTPException(409, "Supply the partial-close broker order ticket")
        if len(orders) != 1: raise HTTPException(409, "Historical close order not found")
        order = orders[0]
        if order.ticket != ticket or order.position_id != row["identifier"] or order.comment != request["comment"] or order.magic != request["magic"] or order.symbol != request["symbol"] or order.type != request["type"]:
            raise HTTPException(409, "Partial-close ticket ownership mismatch")
        if order.state not in (2,4,5,6): raise HTTPException(409, "Close order not final")
        deals = [d for d in self._deals(row["identifier"]) if d.order == ticket and d.entry in (1,3) and d.type == request["type"]]
        volume = sum(float(d.volume) for d in deals)
        if 0 < volume <= request["volume"] + 1e-8:
            return "CONFIRMED", {"broker_ticket":ticket, "volume":volume}
        if not deals and order.state in (2,5,6): return "REJECTED", {"broker_ticket":ticket,"broker_state":order.state}
        raise HTTPException(409, "No conclusive partial-close deal evidence")

    def operator_action(self, operation):
        """Ledger-only operation. Never calls order_send or invents a missing fill."""
        with self.b.MT5_LOCK:
            account = self._account(operation.account_id)
            key = self.b.account_key(account)
            fingerprint = hashlib.sha256(operation.model_dump_json().encode()).hexdigest()
            with self.b.get_db() as conn:
                conn.execute("BEGIN IMMEDIATE")
                previous = conn.execute("SELECT fingerprint,result FROM safe_operator_audit WHERE operation_id=?", (operation.operation_id,)).fetchone()
                if previous:
                    if previous["fingerprint"] != fingerprint: raise HTTPException(409, "Operator operation ID reused")
                    return json.loads(previous["result"])
                if operation.kind == "RESET_DRAWDOWN":
                    positions, orders = self._positions(), self.b.mt5.orders_get()
                    if orders is None or positions or orders: raise HTTPException(409, "Account must be confirmed flat before drawdown review")
                    if conn.execute("SELECT 1 FROM safe_requests WHERE account=? AND status IN ('SENDING','UNKNOWN')",(key,)).fetchone() or conn.execute("SELECT 1 FROM safe_actions WHERE account=? AND status IN ('SENDING','UNKNOWN')",(key,)).fetchone():
                        raise HTTPException(409, "Reconcile all unknown submissions before reviewing the risk latch")
                    saved = conn.execute("SELECT * FROM safe_risk WHERE account=?",(key,)).fetchone()
                    if not saved or not saved["drawdown_locked"]: raise HTTPException(409, "No drawdown latch to review")
                    equity = float(account.equity)
                    if not positive(equity) or (saved["peak"]-equity)/saved["peak"]*100 >= self.b.SAFE["max_drawdown_pct"]*.7:
                        raise HTTPException(409, "Equity has not recovered below the drawdown hysteresis threshold")
                    # Preserve the original high-water mark and the daily lock.
                    conn.execute("UPDATE safe_risk SET drawdown_locked=0 WHERE account=?",(key,))
                    result = {"status":"REVIEWED", "peak_preserved":saved["peak"], "daily_lock_preserved":bool(saved["daily_locked"])}
                elif operation.kind == "ENTRY":
                    row = conn.execute("SELECT * FROM safe_requests WHERE account=? AND signal_id=?",(key,operation.entity)).fetchone()
                    if not row or row["status"] not in ("SENDING","UNKNOWN"): raise HTTPException(409,"Request is not unresolved")
                    if row["status"] == "SENDING" and row["submitted_at"] and time.time()-row["submitted_at"] < 30:
                        raise HTTPException(409, "Submission still in flight; wait before reconciling")
                    if not operation.broker_ticket: raise HTTPException(422,"Broker order ticket required")
                    state, proof = self._request_evidence(row,operation.broker_ticket)
                    conn.execute("UPDATE safe_requests SET status=?,receipt=? WHERE account=? AND signal_id=?",(state,json.dumps(proof) if state=="FILLED" else None,key,operation.entity))
                    result = {"status":state,"evidence":proof}
                else:
                    row = conn.execute("SELECT * FROM safe_actions WHERE account=? AND id=?",(key,operation.entity)).fetchone()
                    if not row or row["status"] not in ("SENDING","UNKNOWN"): raise HTTPException(409,"Action is not unresolved")
                    if row["status"] == "SENDING" and time.time()-row["created_at"] < 30:
                        raise HTTPException(409, "Management submission still in flight; wait before reconciling")
                    state, proof = self._action_evidence(row,operation.broker_ticket)
                    conn.execute("UPDATE safe_actions SET status=?,response_json=? WHERE id=?",(state,json.dumps(proof),operation.entity))
                    result = {"status":state,"evidence":proof}
                self._account(key)  # Roll back if the terminal switched during evidence lookup.
                conn.execute("INSERT INTO safe_operator_audit VALUES (?,?,?,?,?,?,?,?)",(operation.operation_id,key,fingerprint,time.time(),operation.kind,operation.entity,operation.reason,json.dumps(result)))
                return result
