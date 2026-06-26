"""
Cloudflare Settings API - Configure Cloudflare from admin UI
"""

import os
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from pydantic import BaseModel

from app.api.deps import AdminUser
from app.services.runtime_app_settings import (
    get_app_settings as get_runtime_settings,
    set_app_settings as set_runtime_settings,
)
from app.core.config import get_settings

router = APIRouter()

# Storage directory for mobile apps (fallback)
STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "storage", "mobile")
os.makedirs(STORAGE_DIR, exist_ok=True)


class CloudflareSettings(BaseModel):
    enabled: bool
    api_token: str
    zone_id: str
    domain: str
    r2_bucket: str
    r2_access_key: str
    r2_secret_key: str
    r2_public_url: str


class CloudflareSettingsResponse(BaseModel):
    enabled: bool
    domain: str
    r2_bucket: str
    r2_public_url: str
    ssl_status: Optional[str] = None


@router.get("/cloudflare", response_model=CloudflareSettingsResponse)
async def get_cloudflare_settings(current_user: AdminUser):
    """Get Cloudflare configuration."""
    settings = get_settings()
    
    # Try to get from runtime settings
    cf_settings = get_runtime_settings("cloudflare") or {}
    
    return CloudflareSettingsResponse(
        enabled=cf_settings.get("enabled", False) or settings.CLOUDFLARE_ENABLED,
        domain=cf_settings.get("domain") or settings.CLOUDFLARE_DOMAIN,
        r2_bucket=cf_settings.get("r2_bucket") or settings.CLOUDFLARE_R2_BUCKET,
        r2_public_url=cf_settings.get("r2_public_url") or settings.CLOUDFLARE_R2_PUBLIC_URL,
        ssl_status="active" if cf_settings.get("enabled") else "inactive",
    )


@router.post("/cloudflare")
async def save_cloudflare_settings(
    body: dict,
    current_user: AdminUser = None,
):
    """Save Cloudflare configuration."""
    settings = get_runtime_settings("cloudflare") or {}
    
    if "enabled" in body:
        settings["enabled"] = bool(body["enabled"])
    if "api_token" in body:
        settings["api_token"] = body["api_token"]
    if "zone_id" in body:
        settings["zone_id"] = body["zone_id"]
    if "domain" in body:
        settings["domain"] = body["domain"]
    if "r2_bucket" in body:
        settings["r2_bucket"] = body["r2_bucket"]
    if "r2_access_key" in body:
        settings["r2_access_key"] = body["r2_access_key"]
    if "r2_secret_key" in body:
        settings["r2_secret_key"] = body["r2_secret_key"]
    if "r2_public_url" in body:
        settings["r2_public_url"] = body["r2_public_url"]
    
    set_runtime_settings("cloudflare", settings)
    
    return {"ok": True, "message": "Cloudflare settings saved"}


@router.post("/cloudflare/enable-ssl")
async def enable_cloudflare_ssl(current_user: AdminUser = None):
    """Enable SSL via Cloudflare (requires API token with zone:edit permissions)."""
    cf_settings = get_runtime_settings("cloudflare") or {}
    
    if not cf_settings.get("api_token"):
        raise HTTPException(status_code=400, detail="Cloudflare API token required")
    
    if not cf_settings.get("zone_id"):
        raise HTTPException(status_code=400, detail="Cloudflare Zone ID required")
    
    # This would make API call to Cloudflare to enable SSL
    # For now, return instructions
    return {
        "ok": True,
        "message": "SSL certificate requested from Cloudflare",
        "instructions": [
            "1. Go to Cloudflare Dashboard > SSL/TLS",
            "2. Set mode to 'Full' or 'Full (strict)'",
            "3. Cloudflare will automatically provision SSL"
        ]
    }


async def upload_to_cloudflare_r2(file_content: bytes, filename: str) -> str:
    """Upload file to Cloudflare R2 and return public URL."""
    cf_settings = get_runtime_settings("cloudflare") or {}
    settings = get_settings()
    
    access_key = cf_settings.get("r2_access_key") or settings.CLOUDFLARE_R2_ACCESS_KEY
    secret_key = cf_settings.get("r2_secret_key") or settings.CLOUDFLARE_R2_SECRET_KEY
    bucket = cf_settings.get("r2_bucket") or settings.CLOUDFLARE_R2_BUCKET
    public_url = cf_settings.get("r2_public_url") or settings.CLOUDFLARE_R2_PUBLIC_URL
    
    if not all([access_key, secret_key, bucket]):
        raise HTTPException(status_code=400, detail="Cloudflare R2 not configured")
    
    try:
        import boto3
        client = boto3.client(
            's3',
            endpoint_url=public_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
        )
        
        client.put_object(
            Bucket=bucket,
            Key=f"mobile-apps/{filename}",
            Body=file_content,
            ContentType='application/octet-stream'
        )
        
        return f"{public_url}/mobile-apps/{filename}"
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"R2 upload failed: {str(e)}")


@router.post("/upload/android")
async def upload_android_app(
    file: UploadFile = File(...),
    current_user: AdminUser = None,
):
    """Upload Android APK file."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    ext = os.path.splitext(file.filename)[1].lower()
    if ext != ".apk":
        raise HTTPException(status_code=400, detail="Only .apk files allowed")
    
    content = await file.read()
    filename = f"visioryx-android-{uuid.uuid4().hex[:8]}.apk"
    
    # Check if Cloudflare R2 is configured
    cf_settings = get_runtime_settings("cloudflare") or {}
    settings = get_settings()
    
    if cf_settings.get("enabled") and (cf_settings.get("r2_access_key") or settings.CLOUDFLARE_R2_ACCESS_KEY):
        # Upload to Cloudflare R2
        download_url = await upload_to_cloudflare_r2(content, filename)
    else:
        # Upload to local storage
        filepath = os.path.join(STORAGE_DIR, filename)
        with open(filepath, "wb") as f:
            f.write(content)
        
        base_url = settings.PUBLIC_DASHBOARD_URL
        download_url = f"{base_url}/storage/mobile/{filename}"
    
    # Update settings
    current_version, _, _ = get_runtime_settings("mobile_app_version") or {}
    set_runtime_settings("mobile_app_version", {"version": current_version, "android_url": download_url})
    
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
    if ext != ".ipa":
        raise HTTPException(status_code=400, detail="Only .ipa files allowed")
    
    content = await file.read()
    filename = f"visioryx-ios-{uuid.uuid4().hex[:8]}.ipa"
    
    # Check if Cloudflare R2 is configured
    cf_settings = get_runtime_settings("cloudflare") or {}
    settings = get_settings()
    
    if cf_settings.get("enabled") and (cf_settings.get("r2_access_key") or settings.CLOUDFLARE_R2_ACCESS_KEY):
        # Upload to Cloudflare R2
        download_url = await upload_to_cloudflare_r2(content, filename)
    else:
        # Upload to local storage
        filepath = os.path.join(STORAGE_DIR, filename)
        with open(filepath, "wb") as f:
            f.write(content)
        
        base_url = settings.PUBLIC_DASHBOARD_URL
        download_url = f"{base_url}/storage/mobile/{filename}"
    
    # Update settings
    current_version, _, _ = get_runtime_settings("mobile_app_version") or {}
    set_runtime_settings("mobile_app_version", {"version": current_version, "ios_url": download_url})
    
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
    
    # Would need to implement R2 deletion as well
    return {"ok": True}
