"""All execution is an in-memory fake; never initializes a native terminal."""
import json
import sqlite3
import threading
import time
import unittest
from types import SimpleNamespace as NS
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
import fastapi_mt5_bridge as bridge
from broker_lifecycle import BrokerLifecycle, init_schema, plan_management
import test_bridge as fixtures


class LifecycleBroker(fixtures.FakeBroker):
    TRADE_ACTION_SLTP = 6

    def __init__(self, common):
        super().__init__(common)
        self.historical_orders = []
        self.deals = []
        self.requests = []
        self.lose_ack = False
        self.partial_ratio = 1.

    def history_orders_get(self, ticket):
        return tuple(o for o in self.historical_orders if o.ticket == ticket)

    def history_deals_get(self, *args, **kwargs):
        if "ticket" in kwargs:
            return tuple(d for d in self.deals if d.order == kwargs["ticket"])
        if "position" in kwargs:
            return tuple(d for d in self.deals if d.position_id == kwargs["position"])
        return tuple(self.deals)

    def order_send(self, request):
        self.sends += 1
        self.requests.append(dict(request))
        if self.send_code not in (10009, 10010):
            return NS(retcode=self.send_code) if self.send_code else None
        if request["action"] == 6:
            p = self.positions[0]
            assert request["position"] == p.ticket
            p.sl, p.tp = request["sl"], request["tp"]
            result = NS(retcode=10009)
        else:
            closing = "position" in request
            order_id = 9000 + len(self.historical_orders)
            volume = request["volume"] * (self.partial_ratio if closing else 1)
            position_id = self.positions[0].identifier if closing else order_id
            if closing:
                assert request["position"] == self.positions[0].ticket
                assert request["type"] != self.positions[0].type
                self.positions[0].volume = round(self.positions[0].volume - volume, 8)
            else:
                self.positions = (NS(ticket=order_id, identifier=position_id, symbol=request["symbol"],
                    type=request["type"], volume=volume, price_open=request["price"],
                    price_current=request["price"], sl=request["sl"], tp=request["tp"], profit=0.,
                    magic=request["magic"], comment=request["comment"]),)
            self.historical_orders.append(NS(ticket=order_id, position_id=position_id,
                symbol=request["symbol"], type=request["type"], comment=request["comment"], magic=request["magic"], state=4))
            self.deals.append(NS(ticket=10000+len(self.deals), order=order_id, position_id=position_id,
                entry=1 if closing else 0, type=request["type"], volume=volume,
                symbol=request["symbol"], price=request["price"], profit=0., magic=request["magic"]))
            result = NS(retcode=self.send_code, order=order_id, deal=self.deals[-1].ticket, volume=volume, price=request["price"])
        return None if self.lose_ack else result


class LifecycleTests(unittest.TestCase):
    write_news = fixtures.BridgeTests.write_news
    send = fixtures.BridgeTests.send

    def setUp(self):
        fixtures.BridgeTests.setUp(self)
        self.broker = LifecycleBroker(self.temp.name)
        p = patch.object(bridge, "mt5", self.broker)
        p.start(); self.addCleanup(p.stop)
        self.manager = BrokerLifecycle(bridge)

    def policy(self):
        return {**bridge.SAFE, "point": .01, "tick_size": .01,
                "broker_stop_buffer_points": 5, "max_deviation_points": 3}

    def profitable(self, amount=.25):
        p = self.broker.positions[0]
        if p.type == 0:
            self.broker.tick.bid = p.price_open + amount
            self.broker.tick.ask = self.broker.tick.bid + .025
        else:
            self.broker.tick.ask = p.price_open - amount
            self.broker.tick.bid = self.broker.tick.ask - .025
        self.broker.tick.time = time.time()

    def actions(self):
        with bridge.get_db() as conn:
            return conn.execute("SELECT * FROM safe_actions ORDER BY created_at").fetchall()

    def operation(self, **changes):
        return bridge.OperatorPayload(**{ "operation_id": "test-review-operation-001", "account_id": "TEST-DEMO:123",
            "confirm_account_id": "TEST-DEMO:123", "kind": "ENTRY", "entity": self.data["signal_id"],
            "broker_ticket": 9000, "reason": "Reviewed exact order and deal evidence in fake broker", **changes})

    def reconcile(self, **changes):
        return bridge.reconcile(self.operation(**changes), self.auth)

    def test_long_and_short_trailing_never_loosen(self):
        for side in (0, 1):
            with self.subTest(side=side):
                p = NS(type=side, price_open=2650., volume=.02, symbol="XAUUSD",
                       sl=2649.7 if side == 0 else 2650.3, tp=2650.5 if side == 0 else 2649.5)
                tick = NS(bid=2650.25 if side == 0 else 2649.725, ask=2650.275 if side == 0 else 2649.75, time=time.time())
                plan = plan_management(p, self.broker.info, tick, self.policy(), .02, False)
                self.assertAlmostEqual(plan["sl"], 2650.15 if side == 0 else 2649.85)
                self.assertEqual(plan["partial_volume"], .01)
                p.sl = plan["sl"]
                self.assertIsNone(plan_management(p, self.broker.info, tick, self.policy(), .02, True)["sl"])

    def test_invalid_or_frozen_quotes_cannot_modify(self):
        self.send()
        self.profitable()
        p = self.broker.positions[0]
        self.broker.tick.time -= 60
        with self.assertRaises(ValueError): plan_management(p, self.broker.info, self.broker.tick, self.policy(), .02, False)
        self.broker.tick.time = time.time()
        self.broker.info.trade_freeze_level = 100
        plan = plan_management(p, self.broker.info, self.broker.tick, self.policy(), .02, False)
        self.assertIsNone(plan["sl"])
        self.assertIsNone(plan["partial_volume"])

    def test_minimum_lot_partial_skipped_without_rounding_up(self):
        self.send(qty=.01)
        self.profitable()
        self.manager.run_once()
        partial = [a for a in self.actions() if a["kind"] == "PARTIAL"]
        self.assertEqual(partial[0]["status"], "SKIPPED")
        self.assertEqual(self.broker.positions[0].volume, .01)
        self.assertEqual(self.broker.sends, 2)  # entry + protective SL, not partial

    def test_off_step_remainder_skips_partial(self):
        self.send(qty=.04)
        self.broker.positions[0].volume = .03
        self.broker.info.volume_step = .02
        self.profitable()
        plan = plan_management(self.broker.positions[0], self.broker.info, self.broker.tick, self.policy(), .04, False)
        self.assertIsNone(plan["partial_volume"])
        self.assertIn("volume-step", plan["partial_skip"])

    def test_missing_stop_or_external_volume_increase_blocks_management(self):
        self.send()
        self.manager.run_once()
        self.profitable()
        p = self.broker.positions[0]
        p.sl = 0
        with self.assertRaises(HTTPException): self.manager.run_once()
        p.sl = 2649.7
        p.volume = .04
        with self.assertRaises(HTTPException): self.manager.run_once()
        self.assertEqual(self.broker.sends, 1)

    def test_partial_will_not_use_return_filling_mode(self):
        self.send()
        self.profitable()
        self.broker.positions[0].sl = 2650.2
        self.broker.info.filling_mode = 0
        with self.assertRaises(HTTPException): self.manager.run_once()
        self.assertEqual(self.broker.sends, 1)

    def test_manager_tightens_then_partials_once_across_restart(self):
        self.send()
        self.profitable()
        self.manager.run_once()
        p = self.broker.positions[0]
        self.assertEqual(p.volume, .01)
        self.assertGreater(p.sl, p.price_open)
        self.assertEqual(p.tp, 2650.48)
        self.assertEqual([a["status"] for a in self.actions()], ["CONFIRMED", "CONFIRMED"])
        bridge.init_db()
        BrokerLifecycle(bridge).run_once()
        self.assertEqual(self.broker.sends, 3)

    def test_partially_filled_ioc_consumes_one_shot(self):
        self.send(qty=.04)
        self.broker.info.filling_mode = 2
        self.broker.partial_ratio = .5
        self.broker.send_code = 10010
        self.profitable()
        self.manager.run_once()
        self.manager.run_once()
        self.assertEqual(self.broker.positions[0].volume, .03)
        self.assertEqual(self.broker.sends, 3)
        self.assertEqual(self.actions()[-1]["status"], "CONFIRMED")

    def test_foreign_magic_comment_and_manual_trades_are_not_adopted(self):
        self.send()
        p = self.broker.positions[0]
        self.profitable()
        p.magic = 99
        self.manager.run_once()
        p.magic = 202503
        p.comment = "manual"
        self.manager.run_once()
        p.identifier = 55
        self.manager.run_once()
        self.assertEqual(self.broker.sends, 1)
        self.assertEqual(self.manager.status()["positions"], [])

    def test_stable_identifier_survives_changed_position_ticket(self):
        self.send()
        self.manager.run_once()
        self.broker.positions[0].ticket = 9017
        self.profitable()
        self.manager.run_once()
        self.assertEqual(self.broker.requests[-1]["position"], 9017)
        self.assertEqual(self.broker.positions[0].volume, .01)

    def test_unknown_stop_is_quarantined_and_never_resubmitted(self):
        self.send()
        self.profitable()
        self.broker.lose_ack = True
        self.manager.run_once()
        self.manager.run_once()
        self.assertEqual(self.broker.sends, 2)
        self.assertEqual(self.actions()[0]["status"], "UNKNOWN")
        self.assertTrue(bridge.broker_snapshot()["halted"])

    def test_stop_evidence_reconciliation_does_not_send(self):
        self.test_unknown_stop_is_quarantined_and_never_resubmitted()
        action = self.actions()[0]
        result = self.reconcile(kind="MANAGEMENT", entity=action["id"], broker_ticket=None)
        self.assertEqual(result["status"], "CONFIRMED")
        self.assertEqual(self.broker.sends, 2)

    def test_unknown_partial_no_residual_retry_then_evidence_reconcile(self):
        self.send()
        self.profitable(.17)
        self.manager.run_once()  # BE before partial threshold
        self.broker.positions[0].sl = 2650.2  # already beyond requested trailing level
        self.profitable(.25)
        self.broker.lose_ack = True
        self.manager.run_once()
        self.assertEqual(self.actions()[-1]["kind"], "PARTIAL")
        self.assertEqual(self.actions()[-1]["status"], "UNKNOWN")
        sends = self.broker.sends
        self.manager.run_once()
        self.assertEqual(self.broker.sends, sends)
        self.assertTrue(bridge.broker_snapshot()["halted"])
        result = self.reconcile(kind="MANAGEMENT", entity=self.actions()[-1]["id"], broker_ticket=9001)
        self.assertEqual(result["status"], "CONFIRMED")
        self.assertEqual(self.broker.sends, sends)

    def test_rejected_partial_never_retried(self):
        self.send()
        self.profitable(.25)
        self.broker.positions[0].sl = 2650.2
        self.broker.send_code = 10030
        self.manager.run_once()
        self.manager.run_once()
        self.assertEqual(self.actions()[0]["status"], "REJECTED")
        self.assertEqual(self.broker.sends, 2)

    def test_worker_requires_demo_host_opt_in_even_for_owned_position(self):
        self.send()
        self.profitable()
        for name, value in (("ENABLE_DEMO_ORDERS", False), ("MT5_AVAILABLE", False)):
            with patch.object(bridge, name, value), self.assertRaises(HTTPException): self.manager.run_once()
        self.broker.account.trade_mode = 2
        with self.assertRaises(HTTPException): self.manager.run_once()
        self.assertEqual(self.broker.sends, 1)

    def test_closed_position_requires_deal_proof(self):
        self.send()
        self.manager.run_once()
        self.broker.positions = ()
        self.manager.run_once()
        self.assertEqual(self.manager.status()["positions"][0]["status"], "ACTIVE")
        self.broker.deals.append(NS(order=9001, position_id=9000, entry=1, type=1, volume=.02))
        self.manager.run_once()
        self.assertEqual(self.manager.status()["positions"][0]["status"], "CLOSED")

    def test_worker_health_blocks_new_entries_but_not_protective_exits(self):
        bridge.MANAGEMENT_STATE["healthy"] = False
        with self.assertRaises(HTTPException): self.send()
        bridge.MANAGEMENT_STATE["healthy"] = True
        bridge.MANAGEMENT_STATE["last_tick"] -= 30
        with self.assertRaises(HTTPException): self.send()
        bridge.MANAGEMENT_STATE["last_tick"] = time.time()
        self.send()
        bridge.MANAGEMENT_STATE["healthy"] = False
        self.write_news(locked=True)
        self.profitable()
        self.manager.run_once()
        self.assertEqual(self.broker.positions[0].volume, .01)

    def test_worker_loop_runs_without_a_browser_and_stops(self):
        stop = threading.Event()
        with patch.object(bridge.LIFECYCLE, "run_once", side_effect=lambda: (stop.set() or {"account_id": "TEST-DEMO:123", "tracked": 0})) as tick:
            bridge.management_loop(stop)
        self.assertEqual(tick.call_count, 1)
        self.assertTrue(bridge.MANAGEMENT_STATE["healthy"])

    def make_unknown_entry(self):
        self.broker.lose_ack = True
        with self.assertRaises(HTTPException): self.send()

    def test_entry_reconciliation_is_evidence_based_idempotent_and_audited(self):
        self.make_unknown_entry()
        result = self.reconcile()
        self.assertEqual(result["status"], "FILLED")
        self.assertEqual(self.reconcile(), result)
        self.assertEqual(self.broker.sends, 1)
        self.assertEqual(len(self.manager.status()["audit"]), 1)
        self.assertEqual(self.manager.status()["requests"], [])
        with self.assertRaises(HTTPException): self.reconcile(reason="Changed reason on same operation ID")
        self.manager.discover_positions("TEST-DEMO:123")
        self.assertEqual(len(self.manager.status()["positions"]), 1)

    def test_entry_reconciliation_rejects_wrong_ticket_account_and_missing_proof(self):
        self.make_unknown_entry()
        for changes in ({"broker_ticket": 55}, {"account_id": "OTHER:456", "confirm_account_id": "OTHER:456"}, {"confirm_account_id": "OTHER:456"}):
            with self.assertRaises(HTTPException): self.reconcile(**changes)
        self.broker.historical_orders[0].comment = "foreign"
        with self.assertRaises(HTTPException): self.reconcile()
        self.broker.historical_orders[0].comment = self.broker.requests[0]["comment"]
        self.broker.deals = []
        with self.assertRaises(HTTPException): self.reconcile()
        self.assertEqual(self.broker.sends, 1)
        self.assertEqual(len(self.manager.status()["requests"]), 1)

    def test_final_broker_rejection_clears_unknown_without_inventing_fill(self):
        self.make_unknown_entry()
        self.broker.historical_orders[0].state = 5
        self.broker.deals = []
        self.broker.positions = ()
        self.assertEqual(self.reconcile()["status"], "REJECTED")
        self.assertEqual(self.manager.status()["requests"], [])
        self.assertEqual(self.broker.sends, 1)

    def test_in_flight_reservations_cannot_be_reconciled_immediately(self):
        self.make_unknown_entry()
        with bridge.get_db() as conn: conn.execute("UPDATE safe_requests SET status='SENDING'")
        with self.assertRaises(HTTPException): self.reconcile()
        with bridge.get_db() as conn: conn.execute("UPDATE safe_requests SET submitted_at=?", (time.time()-31,))
        self.assertEqual(self.reconcile()["status"], "FILLED")

    def test_legacy_unknown_entry_is_preserved_without_fabricating_evidence(self):
        self.make_unknown_entry()
        with bridge.get_db() as conn: conn.execute("UPDATE safe_requests SET request_json=NULL")
        with self.assertRaises(HTTPException): self.reconcile()
        self.assertEqual(len(self.manager.status()["requests"]), 1)

    def test_drawdown_review_requires_recovery_and_preserves_peak_and_daily_latch(self):
        bridge.broker_snapshot()
        self.broker.account.equity = 470
        bridge.broker_snapshot()
        with self.assertRaises(HTTPException): self.reconcile(kind="RESET_DRAWDOWN", entity="drawdown", broker_ticket=None)
        self.broker.account.equity = 495
        result = self.reconcile(kind="RESET_DRAWDOWN", entity="drawdown", broker_ticket=None)
        self.assertEqual(result["peak_preserved"], 500)
        self.assertTrue(result["daily_lock_preserved"])
        snapshot = bridge.broker_snapshot()
        self.assertTrue(snapshot["halted"])
        self.assertIn("Daily loss", snapshot["halt_reason"])
        self.assertEqual(self.broker.sends, 0)

    def test_drawdown_review_requires_flat_and_no_unknown_requests(self):
        self.make_unknown_entry()
        bridge.broker_snapshot()
        self.broker.account.equity = 470
        bridge.broker_snapshot()
        self.broker.account.equity = 500
        with self.assertRaises(HTTPException): self.reconcile(kind="RESET_DRAWDOWN", entity="drawdown")
        self.broker.positions = ()
        with self.assertRaises(HTTPException): self.reconcile(kind="RESET_DRAWDOWN", entity="drawdown")

    def test_operator_endpoints_require_auth_and_valid_confirmation(self):
        with TestClient(bridge.app) as client:
            self.assertEqual(client.get("/lifecycle").status_code, 401)
            self.assertEqual(client.post("/operator/reconcile", json=self.operation().model_dump()).status_code, 401)
            self.assertEqual(client.get("/lifecycle", headers={"Authorization": self.auth}).status_code, 200)

    def test_schema_migration_preserves_legacy_rows(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        with conn:
            conn.execute("CREATE TABLE safe_requests(account TEXT,signal_id TEXT,fingerprint TEXT,day TEXT,status TEXT,receipt TEXT)")
            conn.execute("INSERT INTO safe_requests VALUES ('account','old','fp','day','UNKNOWN',NULL)")
            init_schema(conn)
            init_schema(conn)
            self.assertEqual(conn.execute("SELECT signal_id,status,request_json FROM safe_requests").fetchone(), ("old", "UNKNOWN", None))


if __name__ == "__main__": unittest.main()
