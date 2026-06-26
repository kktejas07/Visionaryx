"""User schemas."""
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, EmailStr


class UserBase(BaseModel):
    name: str
    email: EmailStr


class UserCreate(UserBase):
    pass


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = None
    role: Optional[str] = None


class UserResponse(UserBase):
    id: int
    image_path: Optional[str] = None
    is_active: bool
    role: str
    created_at: datetime
    has_face_embedding: bool = False

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    items: list[UserResponse]
    total: int


def user_to_response(user: Any) -> UserResponse:
    """Build response from ORM User without exposing raw embedding vector."""
    emb = getattr(user, "face_embedding", None)
    has_emb = emb is not None and len(emb) > 0
    return UserResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        image_path=user.image_path,
        is_active=user.is_active,
        role=user.role,
        created_at=user.created_at,
        has_face_embedding=has_emb,
    )
