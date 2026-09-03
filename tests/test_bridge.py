import concurrent.futures
import json
import tempfile
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
import fastapi_mt5_bridge as bridge


class FakeBroker:
    ORDER_FILLING_FOK, ORDER_FILLING_IOC, ORDER_FILLING_RETURN = 0, 1, 2
    TRADE_ACTION_DEAL, ORDER_TIME_GTC, TRADE_RETCODE_DONE = 1, 0, 10009

    def __init__(self, common):
        self.common = common
        self.account = NS(login=123, server="TEST-DEMO", balance=500., equity=500., margin_free=500., currency="USD", trade_mode=0)
        self.info = NS(digits=2, visible=True, point=.01, trade_tick_size=.01, trade_tick_value=1., trade_contract_size=100., volume_min=.01, volume_max=100., volume_step=.01, trade_stops_level=0, trade_freeze_level=0, filling_mode=1, trade_exemode=2)
        self.tick = NS(ask=2650.025, bid=2650., time=time.time())
        self.positions, self.orders, self.deals = (), (), ()
        self.sends = 0
        self.check_code = 0
        self.send_code = 10009
        self.profit_failure = False
        self.margin_failure = False
        self.margin = None

    def initialize(self): return True
    def shutdown(self): pass
    def account_info(self): return self.account
    def terminal_info(self): return NS(commondata_path=self.common)
    def symbol_info(self, symbol): return self.info
    def symbol_select(self, symbol, enabled): return True
    def symbol_info_tick(self, symbol): return self.tick
    def positions_get(self): return self.positions
    def orders_get(self): return self.orders
    def history_deals_get(self, start, end): return self.deals
    def order_calc_profit(self, side, symbol, volume, entry, exit):
        if self.profit_failure: return None
        return (1 if side == 0 else -1) * (exit - entry) * volume * 100
    def order_calc_margin(self, side, symbol, volume, price):
        if self.margin_failure: return None
        return self.margin if self.margin is not None else price * volume
    def order_check(self, request): return NS(retcode=self.check_code)
    def order_send(self, request):
        self.sends += 1
        if self.send_code is None: return None
        if self.send_code == 10009:
            self.positions = (NS(ticket=9000, identifier=9000, comment=request["comment"], symbol="XAUUSD", type=request["type"], volume=request["volume"], price_open=request["price"], price_current=request["price"], sl=request["sl"], tp=request["tp"], profit=0, magic=202503),)
        return NS(retcode=self.send_code, order=9000, volume=request["volume"], price=request["price"])


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.broker = FakeBroker(self.temp.name)
        self.news_path = Path(self.temp.name) / "Files" / "TradingFlow_NewsGuard.json"
        self.news_path.parent.mkdir()
        self.write_news()
        for name, value in {"mt5": self.broker, "MT5_AVAILABLE": True, "ENABLE_DEMO_ORDERS": True,
                "START_MANAGEMENT_WORKER": False,
                "MANAGEMENT_STATE": {"healthy": True, "last_tick": time.time(), "account_id": "TEST-DEMO:123", "last_error": ""},
                "DB": str(Path(self.temp.name) / "test.db"), "SECRET": "test-token-only", "utcnow": lambda: datetime(2026, 9, 3, 10, 0, tzinfo=timezone.utc)}.items():
            p = patch.object(bridge, name, value)
            p.start(); self.addCleanup(p.stop)
        bridge.init_db()
        # Unit tests isolate transport/preflight from indicators; signal-engine tests
        # cover the gate math separately. This does not claim terminal integration.
        signal_check = patch.object(bridge, "verify_strategy_signal", return_value=None)
        signal_check.start(); self.addCleanup(signal_check.stop)
        self.auth = "Bearer test-token-only"
        self.data = dict(ticker="XAUUSD", action="BUY", qty=.02, price=2650.025, sl=2649.725, tp=2650.475,
                         signal_id="test-signal-unique-1", account_id="TEST-DEMO:123", source="mt5",
                         signal_time=int(time.time()*1000)-300_000, expires_at=int(time.time()*1000)+300_000,
                         max_loss=2.5, max_margin_pct=25, magic=202503)

    def write_news(self, **patches):
        self.news_path.write_text(json.dumps({"updated_epoch": time.time(), "locked": False, "minutes_before": 30, "minutes_after": 15, "label": "TEST calendar clear", **patches}))

    def send(self, **changes):
        return bridge.place_order(bridge.OrderPayload(**{**self.data, **changes}), self.auth)

    def blocked(self, code, **changes):
        with self.assertRaises(HTTPException) as context: self.send(**changes)
        self.assertEqual(context.exception.status_code, code, context.exception.detail)
        self.assertEqual(self.broker.sends, 0)

    def test_authentication(self):
        with TestClient(bridge.app) as client:
            self.assertEqual(client.get("/health").status_code, 401)
            self.assertEqual(client.get("/account-state").status_code, 401)

    def test_payload_requires_protection_and_finite_values(self):
        for patch_data in ({"sl": None}, {"tp": None}, {"price": float("inf")}, {"qty": float("nan")}, {"source": "simulated"}, {"max_margin_pct": 100}):
            with self.subTest(patch_data=patch_data), self.assertRaises(ValidationError):
                bridge.OrderPayload(**{**self.data, **patch_data})

    def test_missing_news_is_locked(self):
        self.news_path.unlink()
        self.assertTrue(bridge.read_news_status()["locked"])
        self.blocked(403)

    def test_failed_server_signal_validation_blocks_send(self):
        with patch.object(bridge, "verify_strategy_signal", side_effect=HTTPException(422, "Seven gates failed")):
            self.blocked(422)

    def test_bad_news_heartbeats_fail_closed(self):
        for changes in ({"updated_epoch": time.time()-181}, {"updated_epoch": time.time()+60}, {"updated_epoch": float("nan")}, {"locked": "false"}, {"minutes_before": 5}, {"minutes_after": 0}):
            with self.subTest(changes=changes):
                self.write_news(**changes)
                self.assertTrue(bridge.read_news_status()["locked"])
                self.blocked(403)

    def test_high_impact_news_blocks_server_directly(self):
        self.write_news(locked=True)
        self.blocked(403)

    def test_real_account_never_executes(self):
        self.broker.account.trade_mode = 2
        self.blocked(423)

    def test_mock_never_executes(self):
        with patch.object(bridge, "MT5_AVAILABLE", False): self.blocked(423)

    def test_demo_requires_host_opt_in(self):
        with patch.object(bridge, "ENABLE_DEMO_ORDERS", False): self.blocked(423)

    def test_account_switch_rejected(self): self.blocked(409, account_id="other-account:999")
    def test_minimum_lot_not_rounded_up(self): self.blocked(422, qty=.001)
    def test_risk_budget_includes_commission(self): self.blocked(422, max_loss=.61)

    def test_account_risk_limit_cannot_be_bypassed(self): self.blocked(422, qty=.1, max_loss=500)
    def test_margin_failure_blocks(self):
        self.broker.margin_failure = True
        self.blocked(503)
    def test_profit_failure_blocks(self):
        self.broker.profit_failure = True
        self.blocked(503)
    def test_free_margin_enforced(self):
        self.broker.account.margin_free = 1
        self.blocked(422)
    def test_order_check_rejection_blocks(self):
        self.broker.check_code = 10019
        self.blocked(422)
    def test_stale_quote_blocks(self):
        self.broker.tick.time = time.time()-30
        self.blocked(503)
    def test_wide_spread_blocks(self):
        self.broker.tick.ask = self.broker.tick.bid + .15
        self.blocked(403, price=self.broker.tick.ask)
    def test_expired_signal_blocks(self): self.blocked(422, expires_at=int(time.time()*1000)-1)
    def test_existing_position_blocks(self):
        self.broker.positions = (NS(ticket=1),)
        self.blocked(403)
    def test_unavailable_positions_blocks(self):
        self.broker.positions = None
        self.blocked(503)

    def test_duplicate_returns_identical_receipt_and_sends_once(self):
        first = self.send()
        self.assertEqual(first, self.send())
        self.assertEqual(first["status"], "FILLED")
        self.assertEqual(self.broker.sends, 1)

    def test_conflicting_id_is_rejected(self):
        self.send()
        with self.assertRaises(HTTPException) as context: self.send(qty=.01)
        self.assertEqual(context.exception.status_code, 409)
        self.assertEqual(self.broker.sends, 1)

    def test_unknown_never_retried_and_blocks_new_signals(self):
        self.broker.send_code = None
        for signal in (self.data["signal_id"], self.data["signal_id"], "different-signal-id"):
            with self.assertRaises(HTTPException): self.send(signal_id=signal)
        self.assertEqual(self.broker.sends, 1)
        self.assertTrue(bridge.broker_snapshot()["halted"])

    def test_partial_or_placed_result_is_quarantined(self):
        for result in (10008, 10010):
            with self.subTest(result=result):
                with bridge.get_db() as conn: conn.execute("DELETE FROM safe_requests")
                self.broker.send_code = result
                with self.assertRaises(HTTPException) as context: self.send()
                self.assertEqual(context.exception.status_code, 409)
                self.assertTrue(bridge.broker_snapshot()["halted"])

    def test_rejected_send_not_retried_with_another_fill_policy(self):
        self.broker.send_code = 10030
        with self.assertRaises(HTTPException): self.send()
        self.assertEqual(self.broker.sends, 1)

    def test_concurrent_requests_send_once(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: self.send(), range(4)))
        self.assertEqual(self.broker.sends, 1)
        self.assertTrue(all(result == results[0] for result in results))

    def test_daily_cap_persists_in_database(self):
        self.send()
        self.broker.positions = ()
        self.send(signal_id="test-signal-unique-2")
        self.broker.positions = ()
        bridge.init_db()  # restart does not reset the ledger
        with self.assertRaises(HTTPException) as context: self.send(signal_id="test-signal-unique-3")
        self.assertEqual(context.exception.status_code, 403)
        self.assertEqual(self.broker.sends, 2)

    def test_drawdown_latch_survives_recovery_and_restart(self):
        bridge.broker_snapshot()
        self.broker.account.equity = 470
        self.assertTrue(bridge.broker_snapshot()["halted"])
        self.broker.account.equity = 500
        bridge.init_db()
        self.assertTrue(bridge.broker_snapshot()["halted"])

    def test_daily_loss_from_broker_deals_survives_refresh(self):
        self.broker.deals = (NS(type=1, entry=1, profit=-10, order=42),)
        self.assertTrue(bridge.broker_snapshot()["halted"])
        self.blocked(403)


if __name__ == "__main__": unittest.main()
