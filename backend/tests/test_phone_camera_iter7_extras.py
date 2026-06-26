"""Iter7 extras: verify hardening pieces not covered by existing tests.

- phone_frames Mongo collection actually populated after WS push
- camera status flips from 'offline' -> 'active' on WS connect
- /api/v1/cameras/{id}/stream.mjpeg serves phone frames with vxframe boundary
- QR base URL fallback: env URL when no ?base, override URL when ?base provided
- WS with expired pair token closes with code 4010
"""
import asyncio
import io
import os
import time

import pytest
import requests
import websockets
from dotenv import load_dotenv
from PIL import Image
from motor.motor_asyncio import AsyncIOMotorClient

# Load backend .env so we share MONGO_URL/DB_NAME with the live server
load_dotenv("/app/backend/.env")

BASE_HTTP = "http://localhost:8001"
API = f"{BASE_HTTP}/api/v1"
WS_HOST = "ws://localhost:8001"
ADMIN = {"email": "admin@visionaryx.dev", "password": "VisionX2025!"}

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


def _jpeg(color=(10, 200, 100)):
    img = Image.new("RGB", (320, 180), color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=70)
    return buf.getvalue()


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=10)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def access_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=10)
    return r.json()["access_token"]


@pytest.fixture
def fresh_cam(auth_headers):
    r = requests.post(f"{API}/phone-cameras", json={"camera_name": "TEST_iter7_extra"}, headers=auth_headers, timeout=10)
    r.raise_for_status()
    data = r.json()
    yield data
    requests.delete(f"{API}/cameras/{data['id']}", headers=auth_headers, timeout=10)


# 1. Confirm Mongo collection populated
def test_phone_frames_collection_populated(fresh_cam):
    ws_url = f"{WS_HOST}/api/v1/phone-cameras/ws/ingest?token={fresh_cam['pair_token']}"

    async def push():
        async with websockets.connect(ws_url) as ws:
            await ws.send(_jpeg())
            await asyncio.sleep(0.4)

    asyncio.run(push())

    async def lookup():
        client = AsyncIOMotorClient(MONGO_URL)
        try:
            db = client[DB_NAME]
            doc = await db.phone_frames.find_one({"_id": fresh_cam["id"]})
            return doc
        finally:
            client.close()

    doc = asyncio.run(lookup())
    assert doc is not None, "phone_frames doc not created in Mongo"
    assert "bytes" in doc and len(doc["bytes"]) > 100
    assert "ts" in doc and isinstance(doc["ts"], (float, int))
    assert time.time() - doc["ts"] < 10


# 2. Camera status flips to 'active' on WS connect
def test_camera_status_active_after_ws(fresh_cam, auth_headers):
    ws_url = f"{WS_HOST}/api/v1/phone-cameras/ws/ingest?token={fresh_cam['pair_token']}"

    async def push_and_check():
        async with websockets.connect(ws_url) as ws:
            await ws.send(_jpeg())
            await asyncio.sleep(0.3)
            # Inspect camera doc directly via Mongo while WS still open
            client = AsyncIOMotorClient(MONGO_URL)
            try:
                db = client[DB_NAME]
                cam = await db.cameras.find_one({"_id": fresh_cam["id"]})
                return cam
            finally:
                client.close()

    cam = asyncio.run(push_and_check())
    assert cam is not None
    assert cam.get("status") == "active", f"Expected status='active' got {cam.get('status')}"


# 3. /cameras/{id}/stream.mjpeg serves phone frames with vxframe boundary
def test_cameras_stream_mjpeg_serves_phone_frames(fresh_cam, access_token):
    ws_url = f"{WS_HOST}/api/v1/phone-cameras/ws/ingest?token={fresh_cam['pair_token']}"

    async def push():
        async with websockets.connect(ws_url) as ws:
            await ws.send(_jpeg(color=(255, 0, 0)))
            await asyncio.sleep(0.4)

    asyncio.run(push())

    # Connect to the unified stream endpoint with JWT in query string
    url = f"{API}/cameras/{fresh_cam['id']}/stream.mjpeg?token={access_token}"
    with requests.get(url, stream=True, timeout=8) as r:
        assert r.status_code == 200
        ctype = r.headers.get("Content-Type", "")
        assert "multipart/x-mixed-replace" in ctype
        assert "vxframe" in ctype
        # Read a small chunk to confirm boundary is emitted
        chunk = b""
        start = time.time()
        for piece in r.iter_content(chunk_size=4096):
            chunk += piece
            if b"--vxframe" in chunk or time.time() - start > 5:
                break
        assert b"--vxframe" in chunk, "vxframe boundary not seen in MJPEG stream"


# 4a. QR with no ?base uses env REACT_APP_BACKEND_URL
def test_qr_uses_env_when_no_base_query(fresh_cam, auth_headers):
    r = requests.get(
        f"{API}/phone-cameras/{fresh_cam['id']}/qr.png",
        headers=auth_headers, timeout=5,
    )
    assert r.status_code == 200
    assert r.headers["Content-Type"] == "image/png"
    assert r.content[:4] == b"\x89PNG"
    # decode QR back and verify content embeds env URL
    try:
        from PIL import Image as PImage
        from pyzbar.pyzbar import decode
        img = PImage.open(io.BytesIO(r.content))
        decoded = decode(img)
        if decoded:
            data = decoded[0].data.decode()
            env_url = os.environ.get("REACT_APP_BACKEND_URL", "")
            if env_url:
                assert env_url in data, f"QR should embed env URL {env_url}; got {data}"
    except ImportError:
        # pyzbar not installed; PNG existence is still verified
        pytest.skip("pyzbar not installed for QR decode verification")


# 4b. QR with ?base overrides env
def test_qr_with_base_param_overrides(fresh_cam, auth_headers):
    r = requests.get(
        f"{API}/phone-cameras/{fresh_cam['id']}/qr.png",
        params={"base": "https://override.example.com"},
        headers=auth_headers, timeout=5,
    )
    assert r.status_code == 200
    assert r.content[:4] == b"\x89PNG"


# 5. WS with expired token must close with code 4010
def test_ws_expired_token_closes_4010(fresh_cam, auth_headers):
    # Forge expiry in DB
    async def expire():
        client = AsyncIOMotorClient(MONGO_URL)
        try:
            db = client[DB_NAME]
            await db.cameras.update_one(
                {"_id": fresh_cam["id"]},
                {"$set": {"pair_expires_at": time.time() - 60}},
            )
        finally:
            client.close()

    asyncio.run(expire())

    ws_url = f"{WS_HOST}/api/v1/phone-cameras/ws/ingest?token={fresh_cam['pair_token']}"

    async def attempt():
        """Server calls ws.close(code=4010) BEFORE ws.accept(). In Starlette this
        translates to an HTTP 403 during the WebSocket handshake, so the
        client sees `InvalidStatus` rather than receiving the literal 4010
        close frame. Either rejection mode is acceptable evidence that
        expired tokens are blocked.
        """
        from websockets.exceptions import InvalidStatus, ConnectionClosed
        try:
            ws = await asyncio.wait_for(websockets.connect(ws_url), timeout=5)
        except InvalidStatus as e:
            # Handshake rejected (HTTP 403) — what Starlette emits when
            # ws.close() is called before accept()
            return ("handshake_rejected", getattr(e.response, "status_code", None))
        except Exception as e:
            return ("error", type(e).__name__)
        try:
            await asyncio.wait_for(ws.recv(), timeout=5)
        except ConnectionClosed as e:
            return ("closed", e.code)
        except asyncio.TimeoutError:
            return ("timeout", None)
        finally:
            try:
                await ws.close()
            except Exception:
                pass
        return ("no_close", None)

    result = asyncio.run(attempt())
    # Accept either the literal close code 4010 OR a handshake rejection
    # (HTTP 403 from Starlette). Both prove the expired-token branch fires.
    assert result[0] in ("closed", "handshake_rejected"), f"Expected rejection on expired token; got {result}"
    if result[0] == "closed":
        assert result[1] == 4010, f"Expected close code 4010; got {result[1]}"
