"""API dependencies - auth, db, etc."""
from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import Role, decode_access_token
from app.database.connection import get_db
from app.database.models import AuthUser

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AuthUser:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    payload = decode_access_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    # JWT sub stores email for AuthUser
    result = await db.execute(select(AuthUser).where(AuthUser.email == payload["sub"]))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


async def require_admin(
    current_user: Annotated[AuthUser, Depends(get_current_user)],
) -> AuthUser:
    if current_user.role != Role.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


async def require_surveillance_user(
    current_user: Annotated[AuthUser, Depends(get_current_user)],
) -> AuthUser:
    """Operators and admins only — live feeds, analytics, detections, alerts."""
    if current_user.role not in (Role.ADMIN.value, Role.OPERATOR.value):
        raise HTTPException(status_code=403, detail="Surveillance access required")
    return current_user


CurrentUser = Annotated[AuthUser, Depends(get_current_user)]
AdminUser = Annotated[AuthUser, Depends(require_admin)]
SurveillanceUser = Annotated[AuthUser, Depends(require_surveillance_user)]
