"""RTSP → HLS gateway.

Spawns an ffmpeg sub-process per camera that pulls the camera's RTSP stream
and writes HLS segments to a temp directory. The HLS playlist is served via
FastAPI at:

    GET /api/v1/cameras/{id}/hls/index.m3u8?token=<jwt>
    GET /api/v1/cameras/{id}/hls/{segment}.ts?token=<jwt>

The ffmpeg process is started lazily on first playlist request and kept
running for `IDLE_TIMEOUT` seconds after the last request, then torn down.

⚠️ The backend must have **network line-of-sight** to the camera. LAN
addresses like `192.168.x.x` only work when the backend runs on the same
network. For cloud deployments you'll need a VPN (Tailscale etc.) or a
port-forwarded public address.
"""
from __future__ import annotations

import asyncio
import os
import shlex
import shutil
import signal
import tempfile
import time
import urllib.parse
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, Response

import jwt
from deps import JWT_ALGORITHM, JWT_SECRET, get_db

router = APIRouter(prefix="/cameras", tags=["cameras-hls"])

# Where HLS segments are written. Cleared per process restart.
HLS_ROOT = Path(tempfile.gettempdir()) / "vx-hls"
HLS_ROOT.mkdir(parents=True, exist_ok=True)

IDLE_TIMEOUT = 60  # seconds since last fetch before tearing down ffmpeg

_streams: dict[str, dict[str, Any]] = {}  # camera_id → {proc, last_seen, rtsp_url}
_lock = asyncio.Lock()


def _ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def _safe_rtsp_url(raw: str) -> str:
    """Heuristically URL-encode the password portion of an RTSP URL if it
    contains an unencoded `@`. We only touch the section between `://` and
    the LAST `@` (which separates userinfo from host).
    """
    if "://" not in raw:
        return raw
    scheme, rest = raw.split("://", 1)
    if "@" not in rest:
        return raw
    userinfo, host_path = rest.rsplit("@", 1)
    if ":" not in userinfo:
        return raw  # no password
    user, pw = userinfo.split(":", 1)
    # Encode any reserved chars in the password (skip already-encoded `%XX`).
    if "%" not in pw:
        pw = urllib.parse.quote(pw, safe="")
    return f"{scheme}://{user}:{pw}@{host_path}"


async def _auth_from_query(token: str | None) -> dict[str, Any]:
    if not token:
        raise HTTPException(status_code=401, detail="Token query param required")
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def _ensure_stream(camera_id: str, rtsp_url: str) -> Path:
    """Start ffmpeg for this camera if not already running. Returns the
    directory containing `index.m3u8`."""
    out_dir = HLS_ROOT / camera_id
    out_dir.mkdir(parents=True, exist_ok=True)
    playlist = out_dir / "index.m3u8"

    async with _lock:
        entry = _streams.get(camera_id)
        if entry and entry["proc"].returncode is None:
            entry["last_seen"] = time.time()
            return out_dir
        # Clean any stale segments.
        for f in out_dir.glob("*.ts"):
            try: f.unlink()
            except Exception: pass
        if playlist.exists():
            try: playlist.unlink()
            except Exception: pass

        safe = _safe_rtsp_url(rtsp_url)
        cmd = [
            "ffmpeg",
            # Low-latency input flags
            "-fflags", "nobuffer+genpts+discardcorrupt",
            "-flags", "low_delay",
            "-rtsp_transport", "tcp",
            "-stimeout", "5000000",
            "-probesize", "32",
            "-analyzeduration", "0",
            "-i", safe,
            "-an",
            "-c:v", "copy",
            # Low-latency HLS output: 1s segments, 3-window playlist
            "-f", "hls",
            "-hls_time", "1",
            "-hls_list_size", "3",
            "-hls_flags", "delete_segments+independent_segments+omit_endlist",
            "-hls_segment_type", "mpegts",
            "-hls_allow_cache", "0",
            "-hls_segment_filename", str(out_dir / "seg%05d.ts"),
            str(playlist),
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _streams[camera_id] = {
            "proc": proc, "last_seen": time.time(), "rtsp_url": safe, "dir": out_dir,
        }
    # Give ffmpeg up to 6s to write the first playlist.
    deadline = time.time() + 6
    while time.time() < deadline:
        if playlist.exists():
            return out_dir
        if proc.returncode is not None:
            # ffmpeg died — surface its stderr tail.
            try:
                err = (await proc.stderr.read())[-400:].decode(errors="ignore") if proc.stderr else ""
            except Exception:
                err = ""
            raise HTTPException(status_code=502, detail=f"ffmpeg failed: {err.strip()[:300]}")
        await asyncio.sleep(0.2)
    raise HTTPException(status_code=504, detail="Stream did not produce a playlist in time")


async def _reaper():
    while True:
        await asyncio.sleep(15)
        now = time.time()
        async with _lock:
            stale = [cid for cid, e in _streams.items() if now - e["last_seen"] > IDLE_TIMEOUT]
            for cid in stale:
                e = _streams.pop(cid)
                try:
                    e["proc"].send_signal(signal.SIGTERM)
                except Exception:
                    pass


_reaper_task: asyncio.Task | None = None


def _ensure_reaper():
    global _reaper_task
    if _reaper_task is None or _reaper_task.done():
        try:
            _reaper_task = asyncio.get_event_loop().create_task(_reaper())
        except RuntimeError:
            pass


@router.get("/{camera_id}/hls/index.m3u8")
async def hls_playlist(camera_id: str, token: str | None = Query(None)) -> Response:
    await _auth_from_query(token)
    if not _ffmpeg_available():
        raise HTTPException(status_code=503, detail="ffmpeg not installed on backend host")
    db = get_db()
    cam = await db.cameras.find_one({"_id": camera_id})
    if cam is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    if not cam.get("rtsp_url", "").lower().startswith(("rtsp://", "rtsps://", "http://", "https://")):
        raise HTTPException(status_code=400, detail="Camera has no streamable URL")
    _ensure_reaper()
    out_dir = await _ensure_stream(camera_id, cam["rtsp_url"])
    return FileResponse(out_dir / "index.m3u8", media_type="application/vnd.apple.mpegurl",
                        headers={"Cache-Control": "no-cache"})


@router.get("/{camera_id}/hls/{filename}")
async def hls_segment(camera_id: str, filename: str, token: str | None = Query(None)) -> Response:
    await _auth_from_query(token)
    if not filename.endswith((".ts", ".m3u8")) or "/" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid segment name")
    entry = _streams.get(camera_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Stream not started")
    entry["last_seen"] = time.time()
    path = entry["dir"] / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Segment not found")
    media_type = "video/mp2t" if filename.endswith(".ts") else "application/vnd.apple.mpegurl"
    return FileResponse(path, media_type=media_type, headers={"Cache-Control": "no-cache"})


@router.get("/{camera_id}/hls/status")
async def hls_status(camera_id: str, token: str | None = Query(None)) -> dict[str, Any]:
    await _auth_from_query(token)
    entry = _streams.get(camera_id)
    if entry is None:
        return {"running": False, "ffmpeg": _ffmpeg_available()}
    proc = entry["proc"]
    return {
        "running": proc.returncode is None,
        "ffmpeg": True,
        "rtsp": entry["rtsp_url"],
        "last_seen_ago_s": int(time.time() - entry["last_seen"]),
    }
