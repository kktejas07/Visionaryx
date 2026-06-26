"""
Visioryx - Security Module
JWT authentication and password hashing.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from enum import Enum
from typing import Optional

import bcrypt
from jose import JWTError, jwt

from app.core.config import get_settings


class Role(str, Enum):
    """User roles for RBAC."""

    ADMIN = "admin"
    OPERATOR = "operator"
    # Self-service signup: profile + face enrollment only (no cameras/live/analytics by default)
    ENROLLEE = "enrollee"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash."""
    try:
        return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """Hash password for storage."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def create_access_token(
    subject: str | int,
    role: Role = Role.OPERATOR,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create JWT access token."""
    settings = get_settings()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "role": role.value,
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and validate JWT token."""
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None


ENROLLMENT_JWT_TYPE = "face_enroll"


def create_enrollment_token(user_id: int, expires_hours: Optional[int] = None) -> str:
    """Short-lived JWT for public /enroll page (QR link). Not a login token."""
    settings = get_settings()
    hours = expires_hours if expires_hours is not None else settings.ENROLLMENT_TOKEN_EXPIRE_HOURS
    expire = datetime.utcnow() + timedelta(hours=hours)
    to_encode = {
        "exp": expire,
        "sub": str(user_id),
        "typ": ENROLLMENT_JWT_TYPE,
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_enrollment_token(token: str) -> Optional[int]:
    """Return recognition User.id if token is a valid face-enrollment JWT."""
    payload = decode_access_token(token)
    if not payload or payload.get("typ") != ENROLLMENT_JWT_TYPE:
        return None
    try:
        return int(payload.get("sub"))
    except (TypeError, ValueError):
        return None


# Refresh token type identifier
REFRESH_JWT_TYPE = "refresh"


def create_refresh_token(subject: str | int, role: Role = Role.OPERATOR) -> str:
    """Create long-lived refresh token (7 days)."""
    settings = get_settings()
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "role": role.value,
        "typ": REFRESH_JWT_TYPE,
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_refresh_token(token: str) -> Optional[dict]:
    """Decode refresh token and return payload if valid."""
    payload = decode_access_token(token)
    if not payload or payload.get("typ") != REFRESH_JWT_TYPE:
        return None
    return payload
