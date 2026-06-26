"""VisionaryX — AI Studio Agent Run Console regression tests.

Covers:
- GET  /api/v1/ai/agents (list)
- POST /api/v1/ai/agents (create)
- GET  /api/v1/ai/agents/{id}/runs (empty for new agent)
- POST /api/v1/ai/agents/{id}/run-trace (SSE streaming)
- GET  /api/v1/ai/agents/{id}/runs (returns 1 run after trace)
- GET  /api/v1/ai/agent-runs/{run_id}
- Regression: analytics/overview, alerts, cameras
"""
from __future__ import annotations

import json
import os
import time
import uuid

import pytest
import requests

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
ADMIN_EMAIL = "admin@visionaryx.dev"
ADMIN_PASSWORD = "VisionX2025!"


@pytest.fixture(scope="module")
def s() -> requests.Session:
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# --- AI Agents CRUD ---
class TestAgents:
    def test_list_agents(self, s, admin_token):
        r = s.get(f"{API}/ai/agents", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_create_agent(self, s, admin_token, request):
        body = {
            "name": f"TEST_qa_agent_{uuid.uuid4().hex[:6]}",
            "system_prompt": "You are a test agent.",
            "model_id": "openai:gpt-5.4-mini",
            "tools": [],
            "mcp_servers": [],
            "enabled": True,
        }
        r = s.post(f"{API}/ai/agents", json=body, headers=_h(admin_token), timeout=15)
        assert r.status_code == 201, r.text
        data = r.json()
        assert "id" in data
        assert data["name"] == body["name"]
        # stash on session for later tests
        request.config._test_agent_id = data["id"]

    def test_runs_empty_for_new_agent(self, s, admin_token, request):
        agent_id = request.config._test_agent_id
        r = s.get(f"{API}/ai/agents/{agent_id}/runs", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json() == []


# --- Agent Run Trace (SSE streaming) ---
class TestAgentRunTrace:
    def test_run_trace_sse_stream(self, s, admin_token, request):
        agent_id = request.config._test_agent_id
        url = f"{API}/ai/agents/{agent_id}/run-trace"
        headers = {**_h(admin_token), "Accept": "text/event-stream"}
        body = {"input": "Say hi in 5 words."}

        events: list[dict] = []
        run_id: str | None = None
        with s.post(url, json=body, headers=headers, stream=True, timeout=90) as resp:
            assert resp.status_code == 200, resp.text
            ct = resp.headers.get("content-type", "")
            assert "text/event-stream" in ct, f"Expected SSE, got {ct}"
            # parse SSE
            buf = ""
            start = time.time()
            for chunk in resp.iter_content(chunk_size=None, decode_unicode=True):
                if not chunk:
                    continue
                buf += chunk
                while "\n\n" in buf:
                    raw, buf = buf.split("\n\n", 1)
                    for line in raw.splitlines():
                        if line.startswith("data:"):
                            payload = line[5:].strip()
                            try:
                                evt = json.loads(payload)
                            except Exception:
                                continue
                            events.append(evt)
                            if evt.get("type") == "meta":
                                run_id = evt.get("run_id")
                            if evt.get("type") == "done":
                                break
                    if events and events[-1].get("type") == "done":
                        break
                if events and events[-1].get("type") == "done":
                    break
                if time.time() - start > 75:
                    pytest.fail("Agent run-trace stream timed out (>75s)")

        types = [e.get("type") for e in events]
        assert "meta" in types, f"missing meta event; got {types[:5]}"
        meta = next(e for e in events if e["type"] == "meta")
        assert "run_id" in meta and "agent" in meta and "tools_available" in meta
        assert any(t == "delta" for t in types), f"expected delta events, got {types}"
        assert types[-1] == "done", f"last event should be 'done', got {types[-1]}"

        # stash run_id for the next test class
        request.config._test_run_id = run_id

    def test_runs_listed_after_trace(self, s, admin_token, request):
        agent_id = request.config._test_agent_id
        # Allow background write to finalise
        time.sleep(1.5)
        r = s.get(f"{API}/ai/agents/{agent_id}/runs", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        runs = r.json()
        assert isinstance(runs, list) and len(runs) >= 1
        run = runs[0]
        # Fields expected per spec
        for k in ("status", "output", "started_at", "finished_at", "duration_ms", "tool_calls"):
            assert k in run, f"missing field {k} in run: {run}"
        assert run["status"] == "complete", f"expected status=complete, got {run['status']}"
        assert isinstance(run["output"], str) and len(run["output"]) > 0
        assert run["tool_calls"] == []
        assert isinstance(run["duration_ms"], int) and run["duration_ms"] > 0

    def test_get_run_by_id(self, s, admin_token, request):
        run_id = getattr(request.config, "_test_run_id", None)
        if not run_id:
            pytest.skip("no run_id captured")
        r = s.get(f"{API}/ai/agent-runs/{run_id}", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("id") == run_id or d.get("_id") == run_id or "status" in d
        assert d.get("status") == "complete"


# --- Regression on existing endpoints ---
class TestRegression:
    def test_overview(self, s, admin_token):
        r = s.get(f"{API}/analytics/overview", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200

    def test_alerts_limit_3(self, s, admin_token):
        r = s.get(f"{API}/alerts?limit=3", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d

    def test_cameras_list(self, s, admin_token):
        r = s.get(f"{API}/cameras", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# --- Cleanup ---
def test_cleanup_agent(s, admin_token, request):
    agent_id = getattr(request.config, "_test_agent_id", None)
    if not agent_id:
        return
    s.delete(f"{API}/ai/agents/{agent_id}", headers=_h(admin_token), timeout=15)
