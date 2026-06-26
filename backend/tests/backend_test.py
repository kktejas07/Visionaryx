"""VisionaryX backend regression suite (pytest).

Covers: health/meta, auth, analytics (incl. real 7d trend), alerts, cameras,
stream, users (admin-only), audit, detections, settings, enrollment-link,
user patch, and the realtime WebSocket /api/v1/ws.
"""
from __future__ import annotations

import asyncio
import json
import os
import uuid

import pytest
import requests
import websockets

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    import re
    from pathlib import Path
    env_file = Path("/app/frontend/.env")
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            m = re.match(r"REACT_APP_BACKEND_URL\s*=\s*(.+)", line)
            if m:
                BASE_URL = m.group(1).strip().strip('"').rstrip("/")
                break

API = f"{BASE_URL}/api/v1"
WS_BASE = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")

ADMIN_EMAIL = "admin@visionaryx.dev"
ADMIN_PASSWORD = "VisionX2025!"
OPERATOR_EMAIL = "operator@visionaryx.dev"
OPERATOR_PASSWORD = "Operator2025!"


# ---- fixtures ----
@pytest.fixture(scope="session")
def s() -> requests.Session:
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _login(sess: requests.Session, email: str, password: str) -> str:
    r = sess.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_token(s):
    return _login(s, ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="session")
def operator_token(s):
    return _login(s, OPERATOR_EMAIL, OPERATOR_PASSWORD)


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---- health & meta ----
class TestHealthMeta:
    def test_health(self, s):
        r = s.get("http://localhost:8001/health", timeout=10)
        assert r.status_code == 200
        assert r.json().get("status") == "healthy"

    def test_meta_version(self, s):
        r = s.get(f"{API}/meta/version", timeout=10)
        assert r.status_code == 200
        assert r.json()["app_name"] == "VisionaryX"


# ---- auth ----
class TestAuth:
    def test_login_ok(self, s):
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_login_wrong_password(self, s):
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "WRONG_PWD!!"})
        assert r.status_code == 401

    def test_me(self, s, admin_token):
        r = s.get(f"{API}/auth/me", headers=_h(admin_token))
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_me_no_token(self, s):
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---- analytics ----
class TestAnalytics:
    def test_overview_auth_required(self, s):
        r = s.get(f"{API}/analytics/overview")
        assert r.status_code == 401

    def test_overview_real_trend_and_window_fields(self, s, admin_token):
        """Spec: detection_trend_7d is a REAL % delta and the response also
        exposes detections_last_7d + detections_prev_7d."""
        r = s.get(f"{API}/analytics/overview", headers=_h(admin_token))
        assert r.status_code == 200
        d = r.json()
        # Existing keys
        for k in [
            "total_users",
            "total_cameras",
            "active_cameras",
            "detections_today",
            "unknown_detections_today",
            "detection_trend_7d",
        ]:
            assert k in d, f"missing key {k}"
        # NEW required fields per spec
        assert "detections_last_7d" in d, "missing detections_last_7d (real-trend computation)"
        assert "detections_prev_7d" in d, "missing detections_prev_7d (real-trend computation)"
        assert isinstance(d["detections_last_7d"], int)
        assert isinstance(d["detections_prev_7d"], int)
        # The % should be the computed delta, not a fixed random range
        last, prev = d["detections_last_7d"], d["detections_prev_7d"]
        if prev > 0:
            expected = round((last - prev) / prev * 100, 1)
            assert d["detection_trend_7d"] == pytest.approx(expected, abs=1), (
                f"detection_trend_7d should be (last-prev)/prev*100={expected}, got {d['detection_trend_7d']}"
            )
        # Determinism: two consecutive calls must return the SAME trend value.
        r2 = s.get(f"{API}/analytics/overview", headers=_h(admin_token))
        assert r2.json()["detection_trend_7d"] == d["detection_trend_7d"], (
            "detection_trend_7d changes between calls — still random"
        )

    def test_detection_trends(self, s, admin_token):
        r = s.get(f"{API}/analytics/detection-trends?days=7", headers=_h(admin_token))
        assert r.status_code == 200 and len(r.json()) == 7

    def test_recent_detections(self, s, admin_token):
        r = s.get(f"{API}/analytics/recent-detections?limit=5", headers=_h(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_detection_status_trends(self, s, admin_token):
        r = s.get(f"{API}/analytics/detection-status-trends?days=14", headers=_h(admin_token))
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        for it in items:
            assert {"date", "known", "unknown"} <= it.keys()

    def test_object_stats(self, s, admin_token):
        r = s.get(f"{API}/analytics/object-stats", headers=_h(admin_token))
        assert r.status_code == 200
        assert any(it["object"] == "person" for it in r.json())


# ---- alerts ----
class TestAlerts:
    def test_list(self, s, admin_token):
        r = s.get(f"{API}/alerts?limit=10", headers=_h(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "total" in d

    def test_filter_severity(self, s, admin_token):
        r = s.get(f"{API}/alerts?severity=high&limit=50", headers=_h(admin_token))
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["severity"] == "high"

    def test_mark_read(self, s, admin_token):
        lst = s.get(f"{API}/alerts?limit=1", headers=_h(admin_token)).json()
        if not lst["items"]:
            pytest.skip("no alerts")
        aid = lst["items"][0]["id"]
        r = s.patch(f"{API}/alerts/{aid}/read", headers=_h(admin_token))
        assert r.status_code == 200 and r.json()["is_read"] is True


# ---- cameras ----
class TestCameras:
    def test_list(self, s, admin_token):
        r = s.get(f"{API}/cameras", headers=_h(admin_token))
        assert r.status_code == 200 and len(r.json()) >= 6

    def test_admin_create_and_delete(self, s, admin_token):
        body = {"camera_name": f"TEST_cam_{uuid.uuid4().hex[:6]}", "rtsp_url": "rtsp://1.1.1.1/x", "is_enabled": True}
        r = s.post(f"{API}/cameras", json=body, headers=_h(admin_token))
        assert r.status_code == 201
        cam_id = r.json()["id"]
        d = s.delete(f"{API}/cameras/{cam_id}", headers=_h(admin_token))
        assert d.status_code in (200, 204)

    def test_operator_cannot_create(self, s, operator_token):
        r = s.post(f"{API}/cameras", json={"camera_name": "TEST_nope", "rtsp_url": "rtsp://x"}, headers=_h(operator_token))
        assert r.status_code == 403


# ---- detections (new shape) ----
class TestDetections:
    def test_list_shape(self, s, admin_token):
        r = s.get(f"{API}/detections?limit=10", headers=_h(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "total" in d
        if d["items"]:
            it = d["items"][0]
            for k in ("id", "camera_name", "status", "confidence", "timestamp"):
                assert k in it


# ---- users (admin) ----
class TestUsers:
    def test_admin_list_items_total_shape(self, s, admin_token):
        r = s.get(f"{API}/users", headers=_h(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, dict), f"users should be dict {{items,total}}, got {type(d)}"
        assert "items" in d and "total" in d
        emails = {u["email"] for u in d["items"]}
        assert ADMIN_EMAIL in emails

    def test_operator_blocked(self, s, operator_token):
        r = s.get(f"{API}/users", headers=_h(operator_token))
        assert r.status_code == 403

    def test_enrollment_link(self, s, admin_token):
        users = s.get(f"{API}/users", headers=_h(admin_token)).json()["items"]
        op = next(u for u in users if u["email"] == OPERATOR_EMAIL)
        r = s.post(f"{API}/users/{op['id']}/enrollment-link", headers=_h(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is True
        assert "enroll_url" in d and isinstance(d["enroll_url"], str)

    def test_patch_user_role(self, s, admin_token):
        # Create a throwaway operator to patch
        email = f"TEST_patch_{uuid.uuid4().hex[:6]}@visionaryx.dev"
        c = s.post(
            f"{API}/users",
            json={"email": email, "password": "StrongPass123!", "role": "operator", "name": "P"},
            headers=_h(admin_token),
        )
        assert c.status_code == 201
        uid = c.json()["id"]
        try:
            r = s.patch(f"{API}/users/{uid}", json={"role": "admin"}, headers=_h(admin_token))
            assert r.status_code == 200
            assert r.json()["role"] == "admin"
        finally:
            s.delete(f"{API}/users/{uid}", headers=_h(admin_token))


# ---- audit ----
class TestAudit:
    def test_audit_fields(self, s, admin_token):
        r = s.get(f"{API}/audit", headers=_h(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and d["items"], "no audit items"
        it = d["items"][0]
        for k in ("actor_email", "action", "resource_type", "resource_id", "created_at"):
            assert k in it, f"missing audit field {k}"

    def test_operator_blocked(self, s, operator_token):
        r = s.get(f"{API}/audit", headers=_h(operator_token))
        assert r.status_code == 403


# ---- settings/email ----
class TestSettingsEmail:
    def test_get_default(self, s, admin_token):
        r = s.get(f"{API}/settings/email", headers=_h(admin_token))
        assert r.status_code == 200
        d = r.json()
        for k in ("enabled", "host", "port", "from_email", "from_name", "use_tls", "use_ssl"):
            assert k in d

    def test_patch_and_persist(self, s, admin_token):
        r = s.patch(
            f"{API}/settings/email",
            json={"enabled": True, "host": "smtp.example.dev", "port": 2525, "use_tls": True, "use_ssl": False},
            headers=_h(admin_token),
        )
        assert r.status_code == 200
        g = s.get(f"{API}/settings/email", headers=_h(admin_token)).json()
        assert g["host"] == "smtp.example.dev" and g["port"] == 2525

    def test_send_test_echoes_to(self, s, admin_token):
        r = s.post(f"{API}/settings/email/test", json={"to": "ops@example.dev"}, headers=_h(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert d.get("ok") is True
        assert d.get("to") == "ops@example.dev"

    def test_operator_blocked(self, s, operator_token):
        r = s.get(f"{API}/settings/email", headers=_h(operator_token))
        assert r.status_code == 403


# ---- stream ----
class TestStream:
    def test_stream_status(self, s, admin_token):
        r = s.get(f"{API}/stream/status", headers=_h(admin_token))
        assert r.status_code == 200
        assert "active_camera_ids" in r.json()


# ---- WebSocket /api/v1/ws ----
class TestWebSocket:
    @pytest.mark.asyncio
    async def test_no_token_close_4401(self):
        with pytest.raises(websockets.InvalidStatus) as ei:
            await websockets.connect(f"{WS_BASE}/api/v1/ws")
        # Some gateways reject before WS upgrade; if so, we still consider this a fail-closed.
        assert ei.value.response.status_code in (401, 403, 404)

    @pytest.mark.asyncio
    async def test_no_token_uses_close_code_4401(self):
        """Connect via raw WS and expect server close code 4401 when ingress lets us upgrade."""
        try:
            async with websockets.connect(f"{WS_BASE}/api/v1/ws") as ws:
                # If we did upgrade, we should get a close frame with code 4401
                try:
                    await asyncio.wait_for(ws.recv(), timeout=3)
                except websockets.ConnectionClosed as cc:
                    assert cc.code == 4401
                    return
                pytest.fail("WS opened without token instead of closing with 4401")
        except websockets.InvalidStatus:
            # Gateway-level 401/403 also satisfies the security requirement.
            pass

    @pytest.mark.asyncio
    async def test_invalid_token_close_4401(self):
        try:
            async with websockets.connect(f"{WS_BASE}/api/v1/ws?token=notavalidjwt") as ws:
                try:
                    await asyncio.wait_for(ws.recv(), timeout=3)
                except websockets.ConnectionClosed as cc:
                    assert cc.code == 4401
                    return
                pytest.fail("WS opened with bad token")
        except websockets.InvalidStatus:
            pass

    @pytest.mark.asyncio
    async def test_valid_token_welcome_and_ping_pong(self, admin_token):
        url = f"{WS_BASE}/api/v1/ws?token={admin_token}"
        async with websockets.connect(url, open_timeout=10) as ws:
            welcome = await asyncio.wait_for(ws.recv(), timeout=5)
            data = json.loads(welcome)
            assert data["type"] == "system"
            assert "message" in data["data"]
            await ws.send("ping")
            reply = await asyncio.wait_for(ws.recv(), timeout=5)
            assert reply == "pong"
