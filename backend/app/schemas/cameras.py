"""Camera schemas."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class CameraBase(BaseModel):
    camera_name: str
    rtsp_url: str


class CameraCreate(CameraBase):
    pass


class CameraUpdate(BaseModel):
    camera_name: Optional[str] = None
    rtsp_url: Optional[str] = None
    is_enabled: Optional[bool] = None


class CameraResponse(CameraBase):
    id: int
    status: str
    is_enabled: bool
    created_at: datetime

    class Config:
        from_attributes = True
