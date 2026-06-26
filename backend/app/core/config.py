"""
Visioryx - Core Configuration
Centralized configuration management using Pydantic Settings.
"""
import sys
from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Default dev placeholder — must match .env.example; startup warns if still used with DEBUG=false
DEFAULT_DEV_SECRET_KEY = "change-this-in-production-use-openssl-rand-hex-32"


def _default_stream_ai_overlay() -> bool:
    """Face boxes on live MJPEG: on by default. On macOS, live faces use OpenCV Haar when FACE_DETECTION_BACKEND=auto
    (InsightFace is not used in the capture thread), so boxes are stable. Set false only if you see crashes.
    YOLO is controlled separately via STREAM_ENABLE_YOLO_OVERLAY (still off by default on macOS)."""
    return True


def _default_yolo_overlay() -> bool:
    """YOLO loads torch; keep off on macOS unless explicitly enabled."""
    return sys.platform != "darwin"


def _default_hog_persons() -> bool:
    """OpenCV HOG + Accelerate/OpenBLAS can SIGFPE on macOS (numpy linalg.inv in native code). Off on darwin by default."""
    return sys.platform != "darwin"


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra = "ignore",
    )

    # Application
    APP_NAME: str = "Visioryx"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    
    # Mobile App Downloads (can be updated via admin settings)
    MOBILE_APP_IOS_URL: str = ""
    MOBILE_APP_ANDROID_URL: str = ""
    MOBILE_APP_VERSION: str = "1.0.0"
    
    # Cloudflare Configuration
    CLOUDFLARE_ENABLED: bool = False
    CLOUDFLARE_API_TOKEN: str = ""
    CLOUDFLARE_ZONE_ID: str = ""
    CLOUDFLARE_DOMAIN: str = ""
    CLOUDFLARE_R2_BUCKET: str = ""
    CLOUDFLARE_R2_ACCESS_KEY: str = ""
    CLOUDFLARE_R2_SECRET_KEY: str = ""
    CLOUDFLARE_R2_PUBLIC_URL: str = ""
    
    # Brand Settings
    COMPANY_NAME: str = "Visioryx"
    COMPANY_LOGO_URL: str = ""
    FAVICON_URL: str = ""
    COPYRIGHT_TEXT: str = ""

    # API
    API_V1_PREFIX: str = "/api/v1"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/visioryx"
    DATABASE_URL_SYNC: str = "postgresql://postgres:postgres@localhost:5432/visioryx"

    # Self-service account creation (POST /auth/register). Set false in production if you only want admin-provisioned users.
    ALLOW_PUBLIC_REGISTRATION: bool = True

    # JWT Security
    SECRET_KEY: str = DEFAULT_DEV_SECRET_KEY

    # CORS — comma-separated origins (browser requests). Add your production dashboard URL.
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"
    # Default base URL for enrollment links in emails (override per-tenant in Email & SMTP settings).
    PUBLIC_DASHBOARD_URL: str = "http://localhost:3000"
    # Public API URL for mobile app remote access (e.g., ngrok tunnel URL)
    PUBLIC_API_URL: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7  # 7 days
    # Self-service face enrollment link (JWT). Shorter = more secure for QR sharing.
    ENROLLMENT_TOKEN_EXPIRE_HOURS: int = 48

    # Face Recognition
    # Cosine similarity for matching live face to enrolled embedding (InsightFace; typical 0.38–0.55)
    FACE_SIMILARITY_THRESHOLD: float = 0.45
    # Second pass if strict match fails — ceiling / CCTV profile views vs frontal enrollment often score ~0.28–0.36
    FACE_SIMILARITY_THRESHOLD_RELAXED: float = 0.30
    # Third pass (sharp profile / far subjects / heavy compression). Lower = more IDs; raise if you see wrong names.
    # Set >= RELAXED (e.g. 0.99) to disable this tier.
    FACE_SIMILARITY_THRESHOLD_WIDE: float = 0.27
    # auto = OpenCV Haar on macOS for *live* detect_faces only (avoids InsightFace SIGSEGV); InsightFace on Linux.
    # insightface = always use InsightFace for live (green/unknown boxes; may crash some Macs). opencv = always Haar.
    FACE_DETECTION_BACKEND: str = "auto"
    # InsightFace detector score; Haar fallback always uses 1.0. Lower = more face boxes (may add false positives).
    # InsightFace det_score floor after detection; distant faces often ~0.28–0.36.
    FACE_DETECTION_CONFIDENCE: float = 0.25  # Lowered from 0.35 to detect faces at greater distance
    EMBEDDING_DIMENSION: int = 512

    # Object Detection
    OBJECT_DETECTION_CONFIDENCE: float = 0.5
    OBJECT_DETECTION_IOU_THRESHOLD: float = 0.45

    # Processing
    FRAME_SKIP_RATE: int = 2  # Process every Nth frame
    MAX_CAMERAS: int = 16
    FRAME_QUEUE_SIZE: int = 10

    # Storage Paths
    STORAGE_PATH: str = "storage"
    REGISTERED_FACES_PATH: str = "storage/registered_faces"
    UNKNOWN_FACES_PATH: str = "storage/unknown_faces"
    SNAPSHOTS_PATH: str = "storage/snapshots"

    # WebSocket
    WS_HEARTBEAT_INTERVAL: int = 30

    # Optional: POST JSON payloads when alerts are created (Slack/Discord/custom). Empty = disabled.
    ALERT_WEBHOOK_URL: Optional[str] = None

    # Streaming
    # - "mjpeg": OpenCV VideoCapture + MJPEG endpoint (best dev compatibility; can crash on some macOS setups)
    # - "hls": FFmpeg subprocess generates HLS playlist + segments (recommended for stability)
    #
    # Default to MJPEG so Live Monitoring works immediately in all browsers.
    # You can switch to HLS via env: STREAM_MODE=hls (requires ffmpeg + hls.js or Safari native HLS).
    STREAM_MODE: str = "mjpeg"
    FFMPEG_PATH: str = "ffmpeg"
    HLS_SEGMENT_SECONDS: int = 2
    HLS_LIST_SIZE: int = 6
    # Live MJPEG preview (smooth playback — heavy AI runs only every N frames)
    STREAM_MAX_WIDTH: int = 1280  # resize before JPEG; 0 = no resize
    STREAM_JPEG_QUALITY: int = 82  # 1-100; lower = smaller/faster
    # Run face/object overlay + detection logging every Nth captured frame (higher = smoother stream)
    STREAM_ANNOTATE_EVERY_N_FRAMES: int = 1
    """How often to run AI detection on live streams. 1 = every frame (real-time), higher = less CPU but more delay."""
    # Min seconds between saving unknown-face crops per camera (reduces disk I/O when many faces)
    STREAM_UNKNOWN_SNAPSHOT_MIN_INTERVAL_SEC: float = 1.5
    # Skip OpenCV HOG person boxes when this many faces are already detected (saves CPU on crowded scenes)
    STREAM_SKIP_HOG_MIN_FACE_COUNT: int = 4

    # RTSP decode: "ffmpeg" (subprocess, avoids OpenCV VideoCapture segfaults on macOS)
    # or "opencv" (legacy cv2.VideoCapture — can crash the whole Python process)
    RTSP_CAPTURE_BACKEND: str = "ffmpeg"
    # Fixed decode size for FFmpeg rawvideo pipe (width x height, BGR24). Higher = sharper faces, more CPU.
    STREAM_DECODE_WIDTH: int = 1280
    STREAM_DECODE_HEIGHT: int = 720
    
    # Face/object overlay on MJPEG (drawn on server-side MJPEG frames).
    STREAM_ENABLE_AI_OVERLAY: bool = Field(default_factory=_default_stream_ai_overlay)
    # OpenCV HOG full-body person boxes — CPU-only. Default off on macOS (crash-prone); on Linux default on. Off if YOLO overlay on.
    STREAM_ENABLE_HOG_PERSONS: bool = Field(default_factory=_default_hog_persons)
    # YOLO / Ultralytics (torch) — default off on macOS; major source of SIGSEGV in dev.
    STREAM_ENABLE_YOLO_OVERLAY: bool = Field(default_factory=_default_yolo_overlay)
    
    # nobuffer+low_delay hurts HEVC (IP cams): ref-frame errors / frozen first frame. Enable only for low-latency H.264.
    STREAM_FFMPEG_LOW_LATENCY: bool = False
    # If true, live overlay uses OpenCV Haar only (no face embeddings) — everyone shows Unknown. Use only if InsightFace crashes on live.
    STREAM_FORCE_HAAR_LIVE: bool = False
    
    # MediaMTX Settings
    MEDIAMTX_URL: str = "http://192.168.0.100:8889"
    MEDIAMTX_WS_URL: str = "ws://192.168.0.100:8889"
    MEDIAMTX_API_URL: str = "http://192.168.0.100:9997"

    # GPU (Optional)
    CUDA_VISIBLE_DEVICES: Optional[str] = None
    # InsightFace: -1 = CPU (safer on macOS), 0 = first GPU
    INSIGHTFACE_CTX_ID: int = -1
    # Detector score threshold in FaceAnalysis.prepare (not per-call). Lower = more faces at side angles / distance.
    INSIGHTFACE_DET_THRESH: float = 0.32  # Lowered from 0.38 to detect more distant faces


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance."""
    return Settings()
