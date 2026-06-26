"""
Visioryx - MJPEG Stream API
Live camera feed endpoints.
"""
import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("visioryx")

from app.api.deps import SurveillanceUser, require_surveillance_user
from app.database.models import AuthUser
from app.core.config import get_settings
from app.core.security import Role, decode_access_token
from app.database.connection import get_db
from app.database.models import Camera
from app.services.stream_manager import get_frame, is_streaming, start_stream, stop_stream
from app.services.hls_manager import (
    get_playlist_path,
    get_segment_path,
    is_hls_running,
    start_hls,
    stop_hls,
    wait_for_playlist,
)

router = APIRouter()


def _mediamtx_path_name(camera, camera_id: int) -> str:
    """Derive a MediaMTX-safe path name from the camera record."""
    import re
    name = (camera.camera_name or "").lower().strip()
    name = re.sub(r"[^a-z0-9]+", "_", name).strip("_")
    return name or f"cam_{camera_id}"

def _camera_stream_active(camera_id: int) -> bool:
    """MJPEG thread and/or HLS ffmpeg — whichever mode is running for this camera."""
    return is_hls_running(camera_id) or is_streaming(camera_id)


@router.get("/status")
async def get_streams_status(
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_surveillance_user),
):
    """Which cameras are actively decoding on the server (survives leaving the Live page)."""
    result = await db.execute(select(Camera.id))
    ids = list(result.scalars().all())
    active = [cid for cid in ids if _camera_stream_active(cid)]
    return {"active_camera_ids": active}


def _verify_surveillance_stream_token(token: Optional[str]) -> bool:
    """Verify JWT for img/video src; enrollee tokens cannot access live streams."""
    if not token:
        return False
    payload = decode_access_token(token)
    if not payload:
        return False
    role = payload.get("role")
    return role in (Role.ADMIN.value, Role.OPERATOR.value)


async def _generate_mjpeg(camera_id: int):
    """Yield MJPEG frames for streaming. Uses placeholder when no frame available."""
    from app.services.stream_manager import _get_no_signal_frame

    boundary = "frame"
    while True:
        frame = get_frame(camera_id)
        if not frame:
            frame = _get_no_signal_frame()
        yield (
            b"--" + boundary.encode() + b"\r\n"
            b"Content-Type: image/jpeg\r\n"
            b"Content-Length: " + str(len(frame)).encode() + b"\r\n\r\n"
            + frame + b"\r\n"
        )
        # No delay - send frames as fast as they're available


@router.get("/{camera_id}/mjpeg")
async def stream_mjpeg(
    camera_id: int,
    token: Optional[str] = Query(None, description="JWT for auth (required for img src)"),
    quality: Optional[str] = Query(None, description="Stream quality: 480, 720, 1080"),
    db: AsyncSession = Depends(get_db),
):
    """MJPEG stream for camera. Use <img src='/api/v1/stream/1/mjpeg?token=JWT'>."""
    if not _verify_surveillance_stream_token(token):
        raise HTTPException(status_code=401, detail="Invalid or missing token")
    result = await db.execute(select(Camera).where(Camera.id == camera_id))
    camera = result.scalar_one_or_none()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    if not camera.is_enabled:
        raise HTTPException(status_code=400, detail="Camera disabled")
    if not is_streaming(camera_id):
        start_stream(camera_id, camera.rtsp_url, quality=quality)
        await asyncio.sleep(0.5)  # Short wait for first frame
    return StreamingResponse(
        _generate_mjpeg(camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{camera_id}/hls/index.m3u8")
async def stream_hls_playlist(
    camera_id: int,
    token: Optional[str] = Query(None, description="JWT for auth (required for video src)"),
    db: AsyncSession = Depends(get_db),
):
    """HLS playlist for camera. Use <video src='/api/v1/stream/1/hls/index.m3u8?token=JWT'>."""
    if not _verify_surveillance_stream_token(token):
        raise HTTPException(status_code=401, detail="Invalid or missing token")
    result = await db.execute(select(Camera).where(Camera.id == camera_id))
    camera = result.scalar_one_or_none()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    if not camera.is_enabled:
        raise HTTPException(status_code=400, detail="Camera disabled")

    # Ensure ffmpeg is running
    if not is_hls_running(camera_id):
        ok = start_hls(camera_id, camera.rtsp_url)
        if not ok:
            raise HTTPException(status_code=500, detail="Failed to start HLS stream (ffmpeg)")

    # Wait briefly for the playlist to appear
    await asyncio.to_thread(wait_for_playlist, camera_id)
    playlist = get_playlist_path(camera_id)
    if not playlist:
        raise HTTPException(status_code=504, detail="Stream starting, playlist not ready yet")

    return FileResponse(
        path=str(playlist),
        media_type="application/vnd.apple.mpegurl",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache"},
    )

from pydantic import BaseModel

class WebRTCSignalingRequest(BaseModel):
    sdp: str

@router.get("/{camera_id}/hls/{filename}")
async def stream_hls_segment(
    camera_id: int,
    filename: str,
    token: Optional[str] = Query(None, description="JWT for auth (required for video src)"),
    db: AsyncSession = Depends(get_db),
    current_user: SurveillanceUser = None,
):
    if not _verify_surveillance_stream_token(token):
        raise HTTPException(status_code=401, detail="Invalid or missing token")
    seg = get_segment_path(camera_id, filename)
    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")
    return FileResponse(
        path=str(seg),
        media_type="video/mp2t",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache"},
    )


@router.post("/{camera_id}/webrtc-signal")
async def webrtc_signal(
    camera_id: int,
    current_user: SurveillanceUser, # Moved up to fix SyntaxError
    req: WebRTCSignalingRequest,
    db: AsyncSession = Depends(get_db),
):
    """Proxy WebRTC WHEP signaling to MediaMTX for remote access."""
    result = await db.execute(select(Camera).where(Camera.id == camera_id))
    camera = result.scalar_one_or_none()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
        
    path_name = _mediamtx_path_name(camera, camera_id)
    
    import httpx, logging
    logger = logging.getLogger("visioryx")
    settings = get_settings()
    mtx_url = settings.MEDIAMTX_URL.rstrip('/')
    mtx_signaling_url = f"{mtx_url}/{path_name}/whep"
    
    logger.info(f"Proxying WHEP signal for camera {camera_id} (path: {path_name}) to {mtx_signaling_url}")
    
    async with httpx.AsyncClient() as client:
        try:
            res = await client.post(
                mtx_signaling_url,
                content=req.sdp,
                headers={"Content-Type": "application/sdp"},
                timeout=10.0
            )
            if not res.is_success:
                logger.error(f"WHEP signaling failed for {path_name}: {res.status_code} {res.text}")
                raise HTTPException(status_code=503, detail="MediaMTX not available. Use direct MJPEG stream instead.")
            return {"sdp": res.text, "content_type": res.headers.get("content-type", "application/sdp")}
        except httpx.ConnectError:
            logger.warning(f"MediaMTX not available for {path_name}")
            raise HTTPException(status_code=503, detail="MediaMTX not available. Use direct MJPEG stream.")
        except HTTPException:
            raise
        except Exception as e:
            import traceback
            traceback.print_exc()
            logger.exception(f"WHEP Signaling Exception for {path_name}")
            raise HTTPException(status_code=500, detail=f"Signaling failed: {str(e)}")


@router.post("/{camera_id}/start")
async def start_camera_stream(
    camera_id: int,
    quality: Optional[str] = Query(None, description="Stream quality: 480, 720, 1080"),
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_surveillance_user),
):
    """Start camera stream (MediaMTX registration & AI processing)."""
    result = await db.execute(select(Camera).where(Camera.id == camera_id))
    camera = result.scalar_one_or_none()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    settings = get_settings()
    path_name = _mediamtx_path_name(camera, camera_id)
    
    # Map quality to RTSP subtype - CP Plus cameras use:
    # subtype=0: Main stream (1080p/1080p)
    # subtype=1: Sub stream (CIF/VGA - lower quality)
    quality_subtype_map = {
        "1080": "0",  # Main stream - highest quality
        "720": "0",   # Use main stream for 720p
        "480": "1",   # Use sub stream for 480p
    }
    subtype = quality_subtype_map.get(quality or "720", "0")
    
    # Build RTSP URL with appropriate subtype for quality
    rtsp_url = camera.rtsp_url
    if "subtype=" in rtsp_url:
        # Replace existing subtype with new one
        import re
        rtsp_url = re.sub(r'subtype=\d+', f'subtype={subtype}', rtsp_url)
    elif "?" in rtsp_url:
        # URL already has query params, add subtype
        rtsp_url = f"{rtsp_url}&subtype={subtype}"
    else:
        # URL has no query params, add subtype as query param
        rtsp_url = f"{rtsp_url}?subtype={subtype}"
    
    # 1. Register with MediaMTX for low-latency WebRTC streaming (if available)
    media_mtx_available = False
    if camera.rtsp_url and camera.rtsp_url.startswith("rtsp://"):
        try:
            mtx_api_base = settings.MEDIAMTX_API_URL.rstrip('/')
            import httpx
            async with httpx.AsyncClient() as client:
                # Configure for ultra-low latency WebRTC streaming
                api_url = f"{mtx_api_base}/v3/config/paths/add/{path_name}"
                path_config = {
                    "source": rtsp_url,
                    "sourceOnDemand": True,
                    "sourceOnDemandStartTimeout": "2s",
                    "sourceOnDemandCloseAfter": "2s",
                    # Ultra low latency settings for WebRTC
                    "webrtc": {
                        "latency": 0,
                    },
                    "rtspAddress": "",
                    "protocol": "tcp",
                    "rtspTransport": "tcp",
                    "maxConcurrentStreams": 10,
                }
                res = await client.post(api_url, json=path_config, timeout=10.0)
                if res.status_code in [200, 201, 409]:
                    media_mtx_available = True
                    from app.core.logger import setup_logger
                    setup_logger("visioryx").info(f"MediaMTX path registered: {path_name}")
        except Exception as e:
            # MediaMTX not available - will fall back to direct MJPEG
            pass

    # 2. Start detection pipeline for face detection (runs parallel to WebRTC stream)
    stream_quality = quality or "720"
    rtsp_for_capture = rtsp_url
    
    if is_streaming(camera_id):
        stop_stream(camera_id)
        logger.info(f"Restarting detection pipeline for camera {camera_id} with quality {stream_quality}")
    else:
        logger.info(f"Starting detection pipeline for camera {camera_id} with quality {stream_quality}")
    
    start_stream(camera_id, rtsp_for_capture, quality=stream_quality)
    
    camera.status = "active"
    await db.commit()

    # Use MediaMTX WebRTC if available, otherwise use direct MJPEG
    if media_mtx_available:
        return {
            "status": "started",
            "camera_id": camera_id,
            "mode": "webrtc",
            "stream_type": "mediamtx",
            "path_name": path_name,
            "hls_url": f"{settings.MEDIAMTX_URL.replace(':8889', ':8888').rstrip('/')}/{path_name}/index.m3u8",
            "webrtc_url": f"{settings.MEDIAMTX_WS_URL.rstrip('/')}/{path_name}/"
        }
    else:
        # Fall back to direct MJPEG (local streaming)
        return {
            "status": "started",
            "camera_id": camera_id,
            "mode": "mjpeg",
            "stream_type": "direct",
            "path_name": path_name,
        }


@router.post("/{camera_id}/stop")
async def stop_camera_stream(
    camera_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_surveillance_user),
):
    """Stop camera stream."""
    settings = get_settings()
    if settings.STREAM_MODE.lower() == "hls":
        stop_hls(camera_id)
    else:
        stop_stream(camera_id)
    result = await db.execute(select(Camera).where(Camera.id == camera_id))
    camera = result.scalar_one_or_none()
    if camera:
        camera.status = "inactive"
        await db.commit()
    return {"status": "stopped", "camera_id": camera_id}
