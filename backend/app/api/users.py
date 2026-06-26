"""
Visioryx - Users API
User/face registration endpoints.
"""
import asyncio
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AdminUser
from app.services.smtp_config_store import load_smtp_settings
from app.core.config import get_settings
from app.core.security import create_enrollment_token, decode_access_token
from app.database.connection import get_db
from app.database.models import Detection, User, AuthUser
from app.schemas.users import UserCreate, UserListResponse, UserResponse, UserUpdate, user_to_response
from app.ai.face_detector import insightface_embeddings_enabled
from app.services.detection_overlay import invalidate_embedding_cache
from app.services.face_enrollment import (
    apply_embedding_to_user,
    build_embedding_from_image_bytes_list,
    save_primary_face_image,
)
from app.services.smtp_mailer import public_dashboard_base_for_links, send_smtp_mail_sync
from app.services.audit_service import record_audit

router = APIRouter()


@router.get("", response_model=UserListResponse)
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: AdminUser = None,
    q: Optional[str] = Query(None, description="Search name or email"),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
):
    """List registered users with optional search and pagination."""
    filt = None
    if q and q.strip():
        term = f"%{q.strip()}%"
        filt = or_(User.name.ilike(term), User.email.ilike(term))
    count_stmt = select(func.count(User.id))
    list_stmt = select(User).order_by(User.created_at.desc())
    if filt is not None:
        count_stmt = count_stmt.where(filt)
        list_stmt = list_stmt.where(filt)
    # Sync check: ensure all AuthUsers have a corresponding User record
    auth_result = await db.execute(select(AuthUser))
    auth_users = auth_result.scalars().all()
    user_emails_result = await db.execute(select(User.email))
    existing_user_emails = set(user_emails_result.scalars().all())
    
    any_new = False
    for au in auth_users:
        if au.email not in existing_user_emails:
            name_part = au.email.split('@')[0].capitalize() if au.email else "Admin"
            new_u = User(name=name_part, email=au.email, role=au.role)
            db.add(new_u)
            any_new = True
    
    if any_new:
        await db.commit()
        # Refresh current user emails for the final query
        user_emails_result = await db.execute(select(User.email))
        existing_user_emails = set(user_emails_result.scalars().all())

    total = (await db.execute(count_stmt)).scalar() or 0
    result = await db.execute(list_stmt.limit(limit).offset(offset))
    items = [user_to_response(u) for u in result.scalars().all()]
    return UserListResponse(items=items, total=total)


@router.post("", response_model=UserResponse)
async def create_user(
    data: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AdminUser = None,
):
    """Register a new user (face embedding added via upload)."""
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(name=data.name, email=data.email)
    db.add(user)
    await db.flush()
    await db.refresh(user)
    await record_audit(
        db,
        actor=current_user,
        action="user.create",
        resource_type="user",
        resource_id=user.id,
        detail={"name": user.name, "email": user.email},
    )
    return user_to_response(user)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AdminUser = None,
):
    """Get user by ID."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AdminUser = None,
):
    """Update user."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = data.model_dump(exclude_unset=True)
    
    # If role is being updated, also update AuthUser
    new_role = update_data.get('role')
    if new_role:
        auth_result = await db.execute(select(AuthUser).where(func.lower(AuthUser.email) == user.email.lower()))
        auth_user = auth_result.scalar_one_or_none()
        if auth_user:
            auth_user.role = new_role
    
    for k, v in update_data.items():
        setattr(user, k, v)
    
    await db.flush()
    await db.commit()
    await db.refresh(user)
    return user_to_response(user)


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: AdminUser = None,
):
    """Delete recognition user. Past detections keep their rows; user_id is cleared."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await record_audit(
        db,
        actor=current_user,
        action="user.delete",
        resource_type="user",
        resource_id=user.id,
        detail={"email": user.email, "name": user.name},
    )
    await db.execute(update(Detection).where(Detection.user_id == user_id).values(user_id=None))
    await db.delete(user)
    background_tasks.add_task(invalidate_embedding_cache)
    return {"ok": True}


@router.post("/{user_id}/enrollment-link")
async def create_enrollment_link(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AdminUser = None,
):
    """Issue a time-limited link + JWT for self-service enrollment (share / QR)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    settings = get_settings()
    token = create_enrollment_token(user_id)
    return {
        "token": token,
        "expires_in_hours": settings.ENROLLMENT_TOKEN_EXPIRE_HOURS,
        "enroll_path": f"/enroll?token={token}",
    }


@router.post("/{user_id}/send-enrollment-email")
async def send_enrollment_email(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AdminUser = None,
):
    """Email the user a time-limited face-enrollment link (requires SMTP configured and enabled)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    cfg = await load_smtp_settings(db)
    if not cfg.get("enabled"):
        raise HTTPException(
            status_code=400,
            detail="SMTP is disabled. Configure and enable email under Settings → Email & SMTP.",
        )
    settings = get_settings()
    token = create_enrollment_token(user_id)
    base = public_dashboard_base_for_links(cfg)
    link = f"{base}/enroll?token={token}"
    subject = f"{settings.APP_NAME} — complete your face enrollment"
    text = (
        f"Hello {user.name},\n\n"
        f"Open the link below on your phone or computer to upload face photos for recognition "
        f"(link expires in about {settings.ENROLLMENT_TOKEN_EXPIRE_HOURS} hours).\n\n"
        f"{link}\n\n"
        "If you did not expect this message, you can ignore it.\n"
    )
    html = (
        f"<p>Hello <strong>{user.name}</strong>,</p>"
        "<p>Open the link below to complete face enrollment "
        f"(expires in about {settings.ENROLLMENT_TOKEN_EXPIRE_HOURS} hours).</p>"
        f'<p><a href="{link}">{link}</a></p>'
        "<p>If you did not expect this message, you can ignore it.</p>"
    )
    try:
        await asyncio.to_thread(send_smtp_mail_sync, cfg, user.email, subject, text, html)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Email send failed: {e!s}") from e
    return {"ok": True, "sent_to": user.email, "enroll_url": link}


@router.post("/{user_id}/upload-face")
async def upload_face_image(
    user_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="Face image (jpg, png)"),
    db: AsyncSession = Depends(get_db),
    current_user: AdminUser = None,
):
    """Upload face image for user. Face embedding is extracted automatically."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    raw = await file.read()
    fname = file.filename or "face.jpg"

    try:
        merged = build_embedding_from_image_bytes_list([(fname, raw)])
    except ValueError as e:
        if not insightface_embeddings_enabled():
            raise HTTPException(
                status_code=400,
                detail=(
                    "Face embeddings require InsightFace on the server. "
                    "This install is using OpenCV-only detection (no embeddings). "
                    "Install `insightface` in the backend venv and ensure `backend/models/insightface` "
                    "weights exist, then restart the API."
                ),
            ) from e
        raise HTTPException(
            status_code=400,
            detail=(
                str(e)
                if str(e)
                else (
                    "Could not extract a face embedding from this image. "
                    "Use JPEG, PNG, WebP, or HEIC with a clear face. "
                    "HEIC may require pillow-heif on the server."
                )
            ),
        ) from e
    except RuntimeError:
        raise HTTPException(
            status_code=400,
            detail=(
                "Face embeddings require InsightFace on the server. "
                "Install `insightface` in the backend venv and ensure `backend/models/insightface` "
                "weights exist, then restart the API."
            ),
        ) from None

    path = save_primary_face_image(user_id, fname, raw)
    apply_embedding_to_user(user, merged, path)
    await db.flush()
    background_tasks.add_task(invalidate_embedding_cache)
    return {"image_path": path, "embedding_extracted": True}


@router.get("/{user_id}/photo")
async def get_user_photo(
    user_id: int,
    token: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Serve uploaded user photo.
    Uses token query param because <img> cannot send Authorization headers.
    Requires token to belong to the requested user or have admin/operator role.
    """
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")
    
    token_data = decode_access_token(token)
    if token_data is None:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    # Verify user has permission to view this photo
    requesting_user_id = token_data.get("sub")
    requesting_user_role = token_data.get("role", "")
    
    # Allow if: user is viewing their own photo, or admin/operator
    if str(requesting_user_id) != str(user_id) and requesting_user_role not in ["admin", "operator"]:
        raise HTTPException(status_code=403, detail="Not authorized to view this photo")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.image_path:
        raise HTTPException(status_code=404, detail="Photo not found")

    import mimetypes

    media_type, _ = mimetypes.guess_type(user.image_path)
    return FileResponse(
        user.image_path,
        media_type=media_type or "application/octet-stream",
        headers={"Cache-Control": "no-store"},
    )
