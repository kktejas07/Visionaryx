"""Tests for new Reports endpoints + HLS gateway reachability."""
from __future__ import annotations

import os
import re
from pathlib import Path

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    env_file = Path("/app/frontend/.env")
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            m = re.match(r"REACT_APP_BACKEND_URL\s*=\s*(.+)", line)
            if m:
                BASE_URL = m.group(1).strip().strip('"').rstrip("/")
                break

API = f"{BASE_URL}/api/v1"
ADMIN_EMAIL = "admin@visionaryx.dev"
ADMIN_PASSWORD = "VisionX2025!"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


# ---- Reports: summary ----
class TestReportsSummary:
    def test_summary_requires_auth(self, s):
        r = s.get(f"{API}/reports/summary?days=30")
        assert r.status_code == 401

    def test_summary_shape(self, s, admin_token):
        r = s.get(f"{API}/reports/summary?days=30", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("window_days", "totals", "timeseries", "top_cameras", "top_persons", "by_severity", "hourly"):
            assert k in d, f"missing key {k}"
        assert d["window_days"] == 30
        for tk in ("total", "known", "unknown", "known_pct"):
            assert tk in d["totals"]
        assert isinstance(d["timeseries"], list)
        assert isinstance(d["hourly"], list) and len(d["hourly"]) == 24
        # Each hourly entry has hour/count
        for h in d["hourly"]:
            assert "hour" in h and "count" in h

    def test_summary_window_param(self, s, admin_token):
        for days in (7, 30, 90):
            r = s.get(f"{API}/reports/summary?days={days}", headers=_h(admin_token), timeout=20)
            assert r.status_code == 200
            assert r.json()["window_days"] == days


# ---- Reports: detections ----
class TestReportsDetections:
    def test_detections_requires_auth(self, s):
        r = s.get(f"{API}/reports/detections")
        assert r.status_code == 401

    def test_detections_shape(self, s, admin_token):
        r = s.get(f"{API}/reports/detections?limit=10", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "items" in d and "total" in d
        if d["items"]:
            it = d["items"][0]
            for k in ("id", "timestamp", "alert_type", "severity", "message", "camera_name", "status"):
                assert k in it, f"missing field {k} in detection item"

    def test_filter_status_known(self, s, admin_token):
        r = s.get(f"{API}/reports/detections?status=known&limit=50", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["status"] == "known", f"item {it.get('id')} not known: {it.get('alert_type')}"

    def test_filter_status_unknown(self, s, admin_token):
        r = s.get(f"{API}/reports/detections?status=unknown&limit=50", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["status"] == "unknown", f"item {it.get('id')} not unknown: {it.get('alert_type')}"

    def test_filter_narrows(self, s, admin_token):
        full = s.get(f"{API}/reports/detections?limit=500", headers=_h(admin_token), timeout=20).json()
        narrow = s.get(f"{API}/reports/detections?status=known&limit=500", headers=_h(admin_token), timeout=20).json()
        assert narrow["total"] <= full["total"]

    def test_person_filter(self, s, admin_token):
        r = s.get(f"{API}/reports/detections?person=camera&limit=20", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200

    def test_date_range_filter(self, s, admin_token):
        # Very narrow range that should produce <= total
        r = s.get(
            f"{API}/reports/detections?start=2020-01-01T00:00:00Z&end=2020-01-02T00:00:00Z&limit=10",
            headers=_h(admin_token),
            timeout=20,
        )
        assert r.status_code == 200
        # Should be empty since dates are pre-system
        assert len(r.json()["items"]) == 0

    def test_limit_param(self, s, admin_token):
        r = s.get(f"{API}/reports/detections?limit=3", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        assert len(r.json()["items"]) <= 3


# ---- HLS Gateway reachability ----
class TestHlsGateway:
    def test_hls_endpoint_does_not_crash(self, s, admin_token):
        """HLS gateway should respond (200 or 502/504) but never 500/crash."""
        cams = s.get(f"{API}/cameras", headers=_h(admin_token), timeout=15).json()
        assert isinstance(cams, list) and len(cams) > 0, "no cameras to test against"
        cam_id = cams[0]["id"]
        url = f"{API}/cameras/{cam_id}/hls/index.m3u8?token={admin_token}"
        r = s.get(url, timeout=30)
        # Expected: 200 (success), 502/504 (LAN unreachable - OK), 401 (token), 404 (not found)
        assert r.status_code in (200, 401, 404, 408, 502, 503, 504), (
            f"HLS gateway returned unexpected {r.status_code}: {r.text[:200]}"
        )

    def test_hls_no_token(self, s, admin_token):
        cams = s.get(f"{API}/cameras", headers=_h(admin_token), timeout=15).json()
        cam_id = cams[0]["id"]
        r = s.get(f"{API}/cameras/{cam_id}/hls/index.m3u8", timeout=15)
        # Should reject without token
        assert r.status_code in (401, 403, 422)
