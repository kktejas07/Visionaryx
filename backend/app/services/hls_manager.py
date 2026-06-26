"""
Visioryx - HLS Stream Manager (FFmpeg)

Safer alternative to OpenCV VideoCapture on macOS where cv2+FFmpeg can segfault.
Spawns one ffmpeg process per camera that writes HLS playlist + segments to disk.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Optional

from app.core.config import get_settings
from app.core.logger import get_logger

logger = get_logger("hls_manager")

_procs_lock = threading.Lock()
_procs: dict[int, subprocess.Popen] = {}


def _camera_dir(camera_id: int) -> Path:
    settings = get_settings()
    base = Path(settings.STORAGE_PATH) / "hls" / f"camera_{camera_id}"
    base.mkdir(parents=True, exist_ok=True)
    return base


def _cleanup_dir(path: Path) -> None:
    try:
        if path.exists():
            # Remove old segments/playlists to avoid serving stale data.
            for p in path.glob("*"):
                try:
                    if p.is_dir():
                        shutil.rmtree(p, ignore_errors=True)
                    else:
                        p.unlink(missing_ok=True)
                except Exception:
                    pass
    except Exception:
        pass


def is_hls_running(camera_id: int) -> bool:
    with _procs_lock:
        p = _procs.get(camera_id)
        return bool(p and p.poll() is None)


def start_hls(camera_id: int, rtsp_url: str) -> bool:
    """
    Start (or ensure) HLS generation for a camera.
    Returns True if the process is running or started successfully.
    """
    if rtsp_url.startswith("test://") or rtsp_url.startswith("demo://"):
        # Keep test:// handled by MJPEG path for now.
        return False

    settings = get_settings()
    out_dir = _camera_dir(camera_id)
    _cleanup_dir(out_dir)

    playlist = out_dir / "index.m3u8"
    segment_pattern = out_dir / "seg_%05d.ts"

    args = [
        settings.FFMPEG_PATH,
        "-hide_banner",
        "-loglevel",
        "warning",
        "-rtsp_transport",
        "tcp",
        "-i",
        rtsp_url,
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-tune",
        "zerolatency",
        "-pix_fmt",
        "yuv420p",
        "-g",
        "48",
        "-sc_threshold",
        "0",
        "-f",
        "hls",
        "-hls_time",
        str(settings.HLS_SEGMENT_SECONDS),
        "-hls_list_size",
        str(settings.HLS_LIST_SIZE),
        "-hls_flags",
        "delete_segments+append_list+independent_segments",
        "-hls_segment_filename",
        str(segment_pattern),
        str(playlist),
    ]

    with _procs_lock:
        existing = _procs.get(camera_id)
        if existing and existing.poll() is None:
            return True

        try:
            # Write logs to per-camera file for debugging.
            out_dir.mkdir(parents=True, exist_ok=True)
            log_path = out_dir / "ffmpeg.log"
            log_f = open(log_path, "ab", buffering=0)

            p = subprocess.Popen(
                args,
                stdout=log_f,
                stderr=log_f,
                stdin=subprocess.DEVNULL,
                close_fds=True,
                env={**os.environ},
            )
            _procs[camera_id] = p
            logger.info(f"HLS started for camera {camera_id} (pid={p.pid})")
            return True
        except FileNotFoundError:
            logger.error("FFmpeg not found. Install ffmpeg or set FFMPEG_PATH.")
            return False
        except Exception as e:
            logger.error(f"Failed to start HLS for camera {camera_id}: {e}")
            return False


def stop_hls(camera_id: int) -> None:
    with _procs_lock:
        p = _procs.pop(camera_id, None)
    if not p:
        return
    try:
        p.terminate()
        try:
            p.wait(timeout=3)
        except subprocess.TimeoutExpired:
            p.kill()
    except Exception:
        pass
    logger.info(f"HLS stopped for camera {camera_id}")


def get_playlist_path(camera_id: int) -> Optional[Path]:
    p = _camera_dir(camera_id) / "index.m3u8"
    return p if p.exists() else None


def get_segment_path(camera_id: int, filename: str) -> Optional[Path]:
    # basic path traversal protection
    if "/" in filename or "\\" in filename or filename.startswith("."):
        return None
    p = _camera_dir(camera_id) / filename
    return p if p.exists() else None


def wait_for_playlist(camera_id: int, timeout_s: float = 6.0) -> bool:
    """Wait until the playlist exists (or timeout)."""
    start = time.time()
    while time.time() - start < timeout_s:
        if get_playlist_path(camera_id) is not None:
            return True
        time.sleep(0.2)
    return False

