"""Detection list API schemas."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class DetectionListItem(BaseModel):
    """Detection row with joined user/camera names for the dashboard."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    camera_id: int
    camera_name: Optional[str] = None
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    status: str
    confidence: float
    timestamp: datetime


class DetectionListResponse(BaseModel):
    items: list[DetectionListItem]
    total: int
