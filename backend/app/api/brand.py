"""
Brand Settings API - Logo, favicon, company name, copyright
"""

import os
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from pydantic import BaseModel

from app.api.deps import AdminUser
from app.services.runtime_app_settings import get_app_settings, set_app_settings
from app.core.config import get_settings

router = APIRouter()

# Storage directory for brand assets
STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "storage", "brand")
os.makedirs(STORAGE_DIR, exist_ok=True)


class BrandSettings(BaseModel):
    company_name: str
    company_logo_url: str
    favicon_url: str
    copyright_text: str
    app_version: str


@router.get("/brand", response_model=BrandSettings)
async def get_brand_settings():
    """Get brand settings (public endpoint)."""
    settings = get_settings()
    brand = get_app_settings("brand") or {}
    
    return BrandSettings(
        company_name=brand.get("company_name") or settings.COMPANY_NAME,
        company_logo_url=brand.get("company_logo_url") or settings.COMPANY_LOGO_URL,
        favicon_url=brand.get("favicon_url") or settings.FAVICON_URL,
        copyright_text=brand.get("copyright_text") or settings.COPYRIGHT_TEXT,
        app_version=brand.get("app_version") or settings.APP_VERSION,
    )


@router.post("/brand")
async def save_brand_settings(
    body: dict,
    current_user: AdminUser = None,
):
    """Save brand settings (admin only)."""
    brand = get_app_settings("brand") or {}
    
    if "company_name" in body:
        brand["company_name"] = body["company_name"]
    if "copyright_text" in body:
        brand["copyright_text"] = body["copyright_text"]
    if "app_version" in body:
        brand["app_version"] = body["app_version"]
    
    set_app_settings("brand", brand)
    
    return {"ok": True, "message": "Brand settings saved"}


@router.post("/brand/logo")
async def upload_company_logo(
    file: UploadFile = File(...),
    current_user: AdminUser = None,
):
    """Upload company logo."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    allowed = {".png", ".jpg", ".jpeg", ".svg", ".webp"}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail="Only image files allowed")
    
    filename = f"logo{ext}"
    filepath = os.path.join(STORAGE_DIR, filename)
    
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    
    settings = get_settings()
    logo_url = f"{settings.PUBLIC_DASHBOARD_URL}/storage/brand/{filename}"
    
    brand = get_app_settings("brand") or {}
    brand["company_logo_url"] = logo_url
    set_app_settings("brand", brand)
    
    return {"ok": True, "logo_url": logo_url}


@router.post("/brand/favicon")
async def upload_favicon(
    file: UploadFile = File(...),
    current_user: AdminUser = None,
):
    """Upload favicon."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    allowed = {".png", ".ico", ".jpg", ".jpeg", ".svg", ".webp"}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail="Only image files allowed")
    
    filename = f"favicon{ext}"
    filepath = os.path.join(STORAGE_DIR, filename)
    
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    
    settings = get_settings()
    favicon_url = f"{settings.PUBLIC_DASHBOARD_URL}/storage/brand/{filename}"
    
    brand = get_app_settings("brand") or {}
    brand["favicon_url"] = favicon_url
    set_app_settings("brand", brand)
    
    return {"ok": True, "favicon_url": favicon_url}
