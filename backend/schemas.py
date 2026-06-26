"""Pydantic models for VisionaryX request/response payloads."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

Role = Literal["admin", "operator", "enrollee"]
Severity = Literal["critical", "high", "medium", "low", "info"]


class LoginBody(BaseModel):
    email: EmailStr
    password: str
    expires_in_days: int | None = None


class RegisterBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    role: Role = "operator"
    name: str | None = None


class ForgotPasswordBody(BaseModel):
    email: EmailStr


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserPublic(BaseModel):
    id: str
    email: EmailStr
    role: Role
    name: str | None = None
    created_at: datetime


class UserPatch(BaseModel):
    role: Role | None = None
    name: str | None = None


class CameraIn(BaseModel):
    camera_name: str
    rtsp_url: str
    is_enabled: bool = True


class CameraPatch(BaseModel):
    camera_name: str | None = None
    rtsp_url: str | None = None
    is_enabled: bool | None = None
