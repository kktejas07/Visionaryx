"""Public metadata (version) for dashboards and mobile clients."""

from fastapi import APIRouter

from app.core.config import get_settings
from app.services.runtime_app_settings import get_public_api_url

router = APIRouter()


@router.get("/version")
async def get_version():
    """App name and backend version — no auth (used by web/mobile footers)."""
    settings = get_settings()
    return {
        "app_name": settings.APP_NAME,
        "backend_version": settings.APP_VERSION,
        "mobile_app_version": settings.MOBILE_APP_VERSION,
        "mobile_app_ios_url": settings.MOBILE_APP_IOS_URL,
        "mobile_app_android_url": settings.MOBILE_APP_ANDROID_URL,
        "public_api_url": get_public_api_url(),
    }
