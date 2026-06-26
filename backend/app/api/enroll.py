"""
Public self-service face enrollment (token link or logged-in user matching User.email).
"""
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.security import decode_enrollment_token
from app.database.connection import get_db
from app.database.models import AuthUser, User
from app.services.detection_overlay import invalidate_embedding_cache
from app.ai.face_detector import insightface_embeddings_enabled
from app.services.face_enrollment import (
    apply_embedding_to_user,
    build_embedding_from_image_bytes_list,
    save_primary_face_image,
)

router = APIRouter()

_MAX_FILES = 5


@router.get("/verify")
async def verify_enrollment_token(
    token: str = Query(..., description="JWT from enrollment link"),
    db: AsyncSession = Depends(get_db),
):
    """Validate token and return display name (for enrollment UI)."""
    uid = decode_enrollment_token(token)
    if uid is None:
        raise HTTPException(status_code=400, detail="Invalid or expired enrollment link")
    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="This profile is disabled")
    return {
        "valid": True,
        "user_id": user.id,
        "user_name": user.name,
        "email_hint": user.email[:2] + "***" if user.email else None,
    }


@router.post("/upload")
async def enroll_upload_with_token(
    background_tasks: BackgroundTasks,
    token: str = Form(...),
    files: list[UploadFile] = File(..., description="1–5 face photos (front / angles)"),
    db: AsyncSession = Depends(get_db),
):
    """Complete enrollment using QR/link token (no dashboard login required)."""
    uid = decode_enrollment_token(token)
    if uid is None:
        raise HTTPException(status_code=400, detail="Invalid or expired enrollment link")
    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=404, detail="User not found")

    if not files or len(files) > _MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Provide 1–{_MAX_FILES} images")

    return await _complete_enrollment(user, files, background_tasks, db)


@router.post("/upload-session")
async def enroll_upload_logged_in(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(..., description="1–5 face photos"),
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Same as /upload but uses dashboard login: matches recognition User by email to AuthUser.
    """
    result = await db.execute(select(User).where(User.email == current_user.email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=404,
            detail="No recognition profile exists for your email. Create an account (public signup) or ask an admin.",
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="This profile is disabled")

    if not files or len(files) > _MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Provide 1–{_MAX_FILES} images")

    return await _complete_enrollment(user, files, background_tasks, db)


async def _complete_enrollment(
    user: User,
    files: list[UploadFile],
    background_tasks: BackgroundTasks,
    db: AsyncSession,
):
    if not insightface_embeddings_enabled():
        raise HTTPException(
            status_code=400,
            detail=(
                "Face embeddings require InsightFace on the server. "
                "Install insightface and model weights, then restart the API."
            ),
        )

    parts: list[tuple[str, bytes]] = []
    for uf in files:
        raw = await uf.read()
        if not raw:
            continue
        name = uf.filename or "photo.jpg"
        parts.append((name, raw))

    if not parts:
        raise HTTPException(status_code=400, detail="Empty file upload")

    try:
        merged = build_embedding_from_image_bytes_list(parts)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError:
        raise HTTPException(
            status_code=400,
            detail="InsightFace is not available on this server.",
        ) from None

    path = save_primary_face_image(user.id, parts[0][0], parts[0][1])
    apply_embedding_to_user(user, merged, path)
    await db.flush()
    background_tasks.add_task(invalidate_embedding_cache)
    return {"ok": True, "user_id": user.id, "embedding_extracted": True, "images_used": len(parts)}
