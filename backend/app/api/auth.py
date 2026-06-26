"""
Visioryx - Auth API
JWT authentication endpoints.
"""
import time
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.config import get_settings
from app.core.security import Role, create_access_token, create_refresh_token, decode_access_token, decode_refresh_token, get_password_hash, verify_password
from app.database.connection import get_db
from app.database.models import AuthUser, User
from pydantic import BaseModel, EmailStr, Field

from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UpdateProfileRequest,
    UserMe,
)

router = APIRouter()

_FAILED_LOGIN_TIMESTAMPS: dict[str, list[float]] = {}
_MAX_FAILED_IN_WINDOW = 5
_WINDOW_SECONDS = 900

def _prune_failed_logins(email: str) -> list[float]:
    now = time.time()
    arr = _FAILED_LOGIN_TIMESTAMPS.setdefault(email, [])
    arr[:] = [t for t in arr if now - t < _WINDOW_SECONDS]
    return arr

def _role_from_db(role_str: str) -> Role:
    try:
        return Role(role_str)
    except ValueError:
        return Role.OPERATOR


@router.post("/register", response_model=TokenResponse)
async def register(
    data: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create an enrollee account and matching recognition User (or link login if User already exists)."""
    settings = get_settings()
    if not settings.ALLOW_PUBLIC_REGISTRATION:
        raise HTTPException(status_code=403, detail="Public registration is disabled")

    email_norm = data.email.strip().lower()
    existing_auth = await db.execute(select(AuthUser).where(func.lower(AuthUser.email) == email_norm))
    if existing_auth.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    existing_user = await db.execute(select(User).where(func.lower(User.email) == email_norm))
    rec_user = existing_user.scalar_one_or_none()

    pwd_hash = get_password_hash(data.password)
    auth = AuthUser(
        email=email_norm,
        hashed_password=pwd_hash,
        role=Role.ENROLLEE.value,
    )
    db.add(auth)
    if not rec_user:
        name = data.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name is required")
        rec_user = User(
            name=name[:255],
            email=email_norm,
            role=Role.ENROLLEE.value,
        )
        db.add(rec_user)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Email already registered") from None

    token = create_access_token(subject=email_norm, role=Role.ENROLLEE)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
async def login(
    data: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Login with email and password. Returns JWT."""
    email_norm = data.email.strip().lower()
    arr = _prune_failed_logins(email_norm)
    if len(arr) >= _MAX_FAILED_IN_WINDOW:
        raise HTTPException(
            status_code=429,
            detail="Too many failed login attempts. Try again in 15 minutes.",
        )
    result = await db.execute(select(AuthUser).where(func.lower(AuthUser.email) == email_norm))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.hashed_password):
        arr.append(time.time())
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Account disabled")
    _FAILED_LOGIN_TIMESTAMPS.pop(email_norm, None)
    
    expires_delta = None
    if data.expires_in_days:
        expires_delta = timedelta(days=data.expires_in_days)
    
    token = create_access_token(
        subject=user.email, 
        role=_role_from_db(user.role),
        expires_delta=expires_delta
    )
    refresh_token = create_refresh_token(subject=user.email, role=_role_from_db(user.role))
    return TokenResponse(access_token=token, refresh_token=refresh_token)


@router.post("/refresh")
async def refresh_token(
    data: dict,
    db: AsyncSession = Depends(get_db),
):
    """Refresh access token using refresh token."""
    refresh = data.get("refresh_token")
    if not refresh:
        raise HTTPException(status_code=400, detail="Refresh token required")
    
    payload = decode_refresh_token(refresh)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
    
    email = payload.get("sub")
    role_str = payload.get("role", "operator")
    
    # Verify user still exists and is active
    result = await db.execute(select(AuthUser).where(func.lower(AuthUser.email) == email.lower()))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or disabled")
    
    # Create new access token
    new_access_token = create_access_token(
        subject=user.email,
        role=_role_from_db(user.role)
    )
    
    return {"access_token": new_access_token, "token_type": "bearer"}


@router.get("/me", response_model=UserMe)
async def get_me(current_user: CurrentUser):
    """Get current authenticated user."""
    return UserMe(id=current_user.id, email=current_user.email, role=current_user.role)


@router.patch("/me", response_model=UserMe)
async def update_profile(
    data: UpdateProfileRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Update email. Requires current password."""
    result = await db.execute(select(AuthUser).where(AuthUser.id == current_user.id))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.current_password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid password")
    if data.email and data.email != user.email:
        existing = await db.execute(select(AuthUser).where(AuthUser.email == data.email))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already in use")
        user.email = data.email
    await db.commit()
    await db.refresh(user)
    return UserMe(id=user.id, email=user.email, role=user.role)


@router.post("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Change password. Requires current password."""
    result = await db.execute(select(AuthUser).where(AuthUser.id == current_user.id))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.current_password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid current password")
    user.hashed_password = get_password_hash(data.new_password)
    await db.commit()
    return {"message": "Password updated successfully"}


class PasswordResetRequest(BaseModel):
    email: EmailStr


@router.post("/forgot-password")
async def forgot_password(
    data: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Request password reset link. For demo purposes, returns a reset token.
    In production, this would send an email with reset link.
    """
    email_norm = data.email.strip().lower()
    result = await db.execute(select(AuthUser).where(func.lower(AuthUser.email) == email_norm))
    user = result.scalar_one_or_none()
    
    # Always return success to prevent email enumeration
    # In production, would send email with reset link
    if user:
        # Generate a temporary reset token (for demo purposes)
        user_role = Role(user.role) if user.role else Role.OPERATOR
        reset_token = create_access_token(
            subject=f"reset:{user.email}",
            role=user_role,
            expires_delta=timedelta(hours=1)
        )
        response = {
            "ok": True, 
            "message": "If an account exists, a password reset link has been sent.",
        }
        # Only include reset token in development mode
        from app.core.config import get_settings
        settings = get_settings()
        if settings.DEBUG:
            response["reset_token"] = reset_token
        return response
    
    return {
        "ok": True, 
        "message": "If an account exists, a password reset link has been sent."
    }


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, max_length=128)


@router.post("/reset-password")
async def reset_password(
    data: PasswordResetConfirm,
    db: AsyncSession = Depends(get_db),
):
    """Reset password using reset token."""
    try:
        payload = decode_access_token(data.token)
        if not payload:
            raise HTTPException(status_code=400, detail="Invalid or expired reset token")
        
        subject = payload.get("sub", "")
        if not subject.startswith("reset:"):
            raise HTTPException(status_code=400, detail="Invalid reset token")
        
        email = subject.replace("reset:", "")
        
        result = await db.execute(select(AuthUser).where(func.lower(AuthUser.email) == email.lower()))
        user = result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        user.hashed_password = get_password_hash(data.new_password)
        await db.commit()
        
        return {"ok": True, "message": "Password reset successfully"}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
