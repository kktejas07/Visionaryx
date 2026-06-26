"""
Mobile App Upload API - Upload APK/IPA files
"""

import os
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from fastapi.responses import FileResponse

from app.api.deps import AdminUser
from app.core.config import get_settings
from app.services.runtime_app_settings import set_mobile_app_settings, get_mobile_app_settings

router = APIRouter()

# Storage directory
STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "storage", "mobile")
os.makedirs(STORAGE_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".apk": "android", ".ipa": "ios"}


@router.post("/upload/android")
async def upload_android_app(
    file: UploadFile = File(...),
    current_user: AdminUser = None,
):
    """Upload Android APK file."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only .apk files allowed")
    
    # Generate unique filename
    filename = f"visioryx-android-{uuid.uuid4().hex[:8]}.apk"
    filepath = os.path.join(STORAGE_DIR, filename)
    
    # Save file
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    
    # Update settings with download URL
    settings = get_settings()
    base_url = settings.PUBLIC_DASHBOARD_URL
    download_url = f"{base_url}/storage/mobile/{filename}"
    
    # Get current settings to preserve version
    current_version, _, _ = get_mobile_app_settings()
    set_mobile_app_settings(version=current_version, android_url=download_url)
    
    return {
        "ok": True,
        "filename": filename,
        "download_url": download_url,
        "size_mb": round(len(content) / (1024 * 1024), 2),
    }


@router.post("/upload/ios")
async def upload_ios_app(
    file: UploadFile = File(...),
    current_user: AdminUser = None,
):
    """Upload iOS IPA file."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only .ipa files allowed")
    
    # Generate unique filename
    filename = f"visioryx-ios-{uuid.uuid4().hex[:8]}.ipa"
    filepath = os.path.join(STORAGE_DIR, filename)
    
    # Save file
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    
    # Update settings with download URL
    settings = get_settings()
    base_url = settings.PUBLIC_DASHBOARD_URL
    download_url = f"{base_url}/storage/mobile/{filename}"
    
    # Get current settings to preserve version
    current_version, _, _ = get_mobile_app_settings()
    set_mobile_app_settings(version=current_version, ios_url=download_url)
    
    return {
        "ok": True,
        "filename": filename,
        "download_url": download_url,
        "size_mb": round(len(content) / (1024 * 1024), 2),
    }


@router.delete("/files")
async def delete_app_file(
    platform: str,
    current_user: AdminUser = None,
):
    """Delete uploaded app file."""
    if platform not in ["android", "ios"]:
        raise HTTPException(status_code=400, detail="Invalid platform")
    
    version, ios_url, android_url = get_mobile_app_settings()
    
    if platform == "android" and android_url:
        # Extract filename from URL
        filename = android_url.split("/")[-1]
        filepath = os.path.join(STORAGE_DIR, filename)
        if os.path.exists(filepath):
            os.remove(filepath)
        set_mobile_app_settings(version=version, android_url="")
    
    if platform == "ios" and ios_url:
        filename = ios_url.split("/")[-1]
        filepath = os.path.join(STORAGE_DIR, filename)
        if os.path.exists(filepath):
            os.remove(filepath)
        set_mobile_app_settings(version=version, ios_url="")
    
    return {"ok": True}
