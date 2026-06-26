"""Auth schemas."""
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Display name for recognition profile")
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    expires_in_days: Optional[int] = Field(None, description="Extend token expiration (30 for 30 days)")


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"


class UserMe(BaseModel):
    id: int
    email: str
    role: str

    class Config:
        from_attributes = True


class UpdateProfileRequest(BaseModel):
    email: EmailStr
    current_password: str = Field(..., min_length=1, description="Current password for verification")


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, description="Current password")
    new_password: str = Field(..., min_length=8, description="New password (min 8 characters)")
