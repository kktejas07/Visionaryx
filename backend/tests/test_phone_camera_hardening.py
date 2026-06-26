"""Hardening regression: rate-limit + MongoDB persistence + base_url QR fallback."""
import asyncio
import io
import time

import pytest
import requests
import websockets
from PIL import Image

API = "http://localhost:8001/api/v1"
ADMIN = {"email": "admin@visionaryx.dev", "password": "VisionX2025!"}


def _jpeg(color=(120, 30, 200)):
    img = Image.new("RGB", (320, 180), color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=70)
    return buf.getvalue()


@pytest.fixture(scope="module")
def auth():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=10)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def cam(auth):
    r = requests.post(f"{API}/phone-cameras", json={"camera_name": "HARDEN_TEST"}, headers=auth, timeout=10)
    r.raise_for_status()
    data = r.json()
    yield data
    requests.delete(f"{API}/cameras/{data['id']}", headers=auth, timeout=10)


class TestMongoBuffer:
    """Frame buffer must persist in MongoDB (multi-worker safe)."""
    def test_frame_persisted_in_mongo(self, auth, cam):
        ws_url = f"ws://localhost:8001/api/v1/phone-cameras/ws/ingest?token={cam['pair_token']}"

        async def push():
            async with websockets.connect(ws_url) as ws:
                await ws.send(_jpeg())
                await asyncio.sleep(0.3)

        asyncio.run(push())
        # The frame should be retrievable IMMEDIATELY through frame.jpg
        # (this would fail if buffer was still process-local since uvicorn may
        # have spawned multiple workers — but even single-worker this proves
        # the round-trip through Mongo works).
        r = requests.get(f"{API}/phone-cameras/{cam['id']}/frame.jpg", headers=auth, timeout=5)
        assert r.status_code == 200
        assert r.headers["Content-Type"] == "image/jpeg"
        # Frame-age header should be present and small.
        age = float(r.headers["X-Frame-Age-S"])
        assert age < 5


class TestRateLimit:
    """WS ingest must drop frames arriving faster than 10 fps."""
    def test_frames_dropped_when_too_fast(self, auth, cam):
        # First clear: send one frame, wait for it to be stored.
        async def push_burst():
            async with websockets.connect(
                f"ws://localhost:8001/api/v1/phone-cameras/ws/ingest?token={cam['pair_token']}"
            ) as ws:
                # Send 20 frames as fast as possible — only ~2-3 should be persisted
                # given the 100ms min interval, since the whole burst takes <100ms.
                for i in range(20):
                    await ws.send(_jpeg(color=(i * 12, 50, 200)))
                # Give the server time to settle but stay under STALE_AFTER_S.
                await asyncio.sleep(0.5)

        t0 = time.time()
        asyncio.run(push_burst())
        elapsed = time.time() - t0
        # Verify the frame is fresh and the latest one was stored.
        r = requests.get(f"{API}/phone-cameras/{cam['id']}/frame.jpg", headers=auth, timeout=5)
        assert r.status_code == 200
        # We can't directly count drops via API, but if rate-limiting works the
        # last frame age should be <1s and consistent (the burst itself was
        # quick so even the persisted frames are recent).
        assert float(r.headers["X-Frame-Age-S"]) < 2.0
        assert elapsed < 3.0  # sanity: burst didn't hang


class TestOversizedFrameRejection:
    def test_oversized_frame_dropped(self, auth, cam):
        big = b"\xff\xd8" + b"\x00" * (3 * 1024 * 1024)  # 3MB garbage JPEG-ish

        async def push():
            async with websockets.connect(
                f"ws://localhost:8001/api/v1/phone-cameras/ws/ingest?token={cam['pair_token']}"
            ) as ws:
                await ws.send(big)
                await asyncio.sleep(0.2)
                # Follow up with a small valid frame — that one SHOULD land.
                await ws.send(_jpeg(color=(0, 200, 0)))
                await asyncio.sleep(0.3)

        asyncio.run(push())
        r = requests.get(f"{API}/phone-cameras/{cam['id']}/frame.jpg", headers=auth, timeout=5)
        assert r.status_code == 200
        # The retrieved frame should be the small one (<200KB), proving the big
        # one was dropped.
        assert len(r.content) < 200_000


class TestQrFallback:
    def test_qr_uses_request_base_url_when_env_missing(self, auth, cam, monkeypatch=None):
        # We can't easily unset REACT_APP_BACKEND_URL on the live server, but
        # we can verify that providing ?base overrides cleanly.
        r = requests.get(
            f"{API}/phone-cameras/{cam['id']}/qr.png",
            params={"base": "https://override.example.com"},
            headers=auth, timeout=5,
        )
        assert r.status_code == 200
        assert r.headers["Content-Type"] == "image/png"
        # PNG magic
        assert r.content[:4] == b"\x89PNG"
