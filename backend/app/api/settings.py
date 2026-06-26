"""
Dashboard settings API — persisted preferences (admin).
"""
from typing import Optional

from pydantic import BaseModel, Field

from fastapi import APIRouter, HTTPException

from app.api.deps import AdminUser, SurveillanceUser
from app.services.runtime_app_settings import (
    clear_yolo_database_override,
    get_yolo_object_detection_state,
    set_yolo_object_detection_enabled,
    get_mobile_app_settings,
    set_mobile_app_settings,
    get_mediamtx_settings,
    set_mediamtx_settings,
    get_public_api_url,
    set_public_api_url,
    get_face_detection_state,
    set_face_detection_enabled,
    clear_face_database_override,
    get_person_detection_state,
    set_person_detection_enabled,
    clear_person_database_override,
)

router = APIRouter()


class AppSettingsResponse(BaseModel):
    yolo_object_detection_enabled: bool
    """Effective on/off for YOLO object detection on live streams."""

    yolo_object_detection_from_database: bool
    """True if stored in DB; False means STREAM_ENABLE_YOLO_OVERLAY from environment is used."""

    face_detection_enabled: bool
    """Effective on/off for face detection overlay."""
    
    face_detection_from_database: bool
    """True if stored in DB; False means STREAM_ENABLE_AI_OVERLAY from environment is used."""
    
    person_detection_enabled: bool
    """Effective on/off for person (HOG) detection overlay."""
    
    person_detection_from_database: bool
    """True if stored in DB; False means STREAM_ENABLE_HOG_PERSONS from environment is used."""

    can_edit: bool
    """True for admin — operators see current state only."""
    
    mobile_app_version: str
    mobile_app_ios_url: str
    mobile_app_android_url: str
    
    mediamtx_url: str
    mediamtx_ws_url: str
    mediamtx_api_url: str
    
    public_api_url: str
    """Public API URL for mobile app remote access (e.g., ngrok tunnel)"""


class AppSettingsPatch(BaseModel):
    yolo_object_detection_enabled: Optional[bool] = Field(
        default=None,
        description="Turn YOLO object detection overlay on or off.",
    )
    use_environment_default_for_yolo: bool = Field(
        default=False,
        description="If true, remove DB override and use STREAM_ENABLE_YOLO_OVERLAY from .env",
    )
    face_detection_enabled: Optional[bool] = Field(
        default=None,
        description="Turn face detection overlay on or off.",
    )
    use_environment_default_for_face: bool = Field(
        default=False,
        description="If true, remove DB override and use STREAM_ENABLE_AI_OVERLAY from .env",
    )
    person_detection_enabled: Optional[bool] = Field(
        default=None,
        description="Turn person (HOG) detection overlay on or off.",
    )
    use_environment_default_for_person: bool = Field(
        default=False,
        description="If true, remove DB override and use STREAM_ENABLE_HOG_PERSONS from .env",
    )
    mobile_app_version: Optional[str] = Field(
        default=None,
        description="Mobile app version for display",
    )
    mobile_app_ios_url: Optional[str] = Field(
        default=None,
        description="iOS app download URL (.ipa or App Store link)",
    )
    mobile_app_android_url: Optional[str] = Field(
        default=None,
        description="Android app download URL (.apk or Play Store link)",
    )
    mediamtx_url: Optional[str] = Field(
        default=None,
        description="MediaMTX server URL (e.g., https://192.168.1.100:8889)",
    )
    mediamtx_ws_url: Optional[str] = Field(
        default=None,
        description="MediaMTX WebSocket URL (e.g., ws://192.168.1.100:8889)",
    )
    mediamtx_api_url: Optional[str] = Field(
        default=None,
        description="MediaMTX API URL (e.g., http://192.168.1.100:9997)",
    )
    public_api_url: Optional[str] = Field(
        default=None,
        description="Public API URL for mobile app remote access (e.g., https://xxx.ngrok-free.dev)",
    )


@router.get("", response_model=AppSettingsResponse)
async def get_app_settings(current_user: SurveillanceUser):
    """Current detection preferences (any authenticated user)."""
    yolo_enabled, yolo_from_db = get_yolo_object_detection_state()
    face_enabled, face_from_db = get_face_detection_state()
    person_enabled, person_from_db = get_person_detection_state()
    is_admin = current_user.role == "admin"
    mobile_version, ios_url, android_url = get_mobile_app_settings()
    mtx = get_mediamtx_settings()
    return AppSettingsResponse(
        yolo_object_detection_enabled=yolo_enabled,
        yolo_object_detection_from_database=yolo_from_db,
        face_detection_enabled=face_enabled,
        face_detection_from_database=face_from_db,
        person_detection_enabled=person_enabled,
        person_detection_from_database=person_from_db,
        can_edit=is_admin,
        mobile_app_version=mobile_version,
        mobile_app_ios_url=ios_url,
        mobile_app_android_url=android_url,
        mediamtx_url=mtx["url"],
        mediamtx_ws_url=mtx["ws_url"],
        mediamtx_api_url=mtx["api_url"],
        public_api_url=get_public_api_url(),
    )


@router.patch("", response_model=AppSettingsResponse)
async def patch_app_settings(
    body: AppSettingsPatch,
    current_user: AdminUser,
):
    """Update persisted settings (admin only)."""
    if body.use_environment_default_for_yolo:
        clear_yolo_database_override()
    elif body.yolo_object_detection_enabled is not None:
        set_yolo_object_detection_enabled(body.yolo_object_detection_enabled)
    
    if body.use_environment_default_for_face:
        clear_face_database_override()
    elif body.face_detection_enabled is not None:
        set_face_detection_enabled(body.face_detection_enabled)
    
    if body.use_environment_default_for_person:
        clear_person_database_override()
    elif body.person_detection_enabled is not None:
        set_person_detection_enabled(body.person_detection_enabled)
    
    if body.mobile_app_version is not None or body.mobile_app_ios_url is not None or body.mobile_app_android_url is not None:
        set_mobile_app_settings(
            version=body.mobile_app_version,
            ios_url=body.mobile_app_ios_url,
            android_url=body.mobile_app_android_url,
        )
    
    if body.mediamtx_url is not None or body.mediamtx_ws_url is not None or body.mediamtx_api_url is not None:
        set_mediamtx_settings(
            url=body.mediamtx_url,
            ws_url=body.mediamtx_ws_url,
            api_url=body.mediamtx_api_url,
        )
    
    if body.public_api_url is not None:
        set_public_api_url(body.public_api_url)
    
    yolo_enabled, yolo_from_db = get_yolo_object_detection_state()
    face_enabled, face_from_db = get_face_detection_state()
    person_enabled, person_from_db = get_person_detection_state()
    mobile_version, ios_url, android_url = get_mobile_app_settings()
    mtx = get_mediamtx_settings()
    return AppSettingsResponse(
        yolo_object_detection_enabled=yolo_enabled,
        yolo_object_detection_from_database=yolo_from_db,
        face_detection_enabled=face_enabled,
        face_detection_from_database=face_from_db,
        person_detection_enabled=person_enabled,
        person_detection_from_database=person_from_db,
        can_edit=True,
        mobile_app_version=mobile_version,
        mobile_app_ios_url=ios_url,
        mobile_app_android_url=android_url,
        mediamtx_url=mtx["url"],
        mediamtx_ws_url=mtx["ws_url"],
        mediamtx_api_url=mtx["api_url"],
        public_api_url=get_public_api_url(),
    )
