"""Alert list API schemas."""
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class AlertItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    camera_id: Optional[int] = None
    alert_type: str
    message: str
    severity: str
    is_read: bool
    meta: Optional[dict[str, Any]] = None
    timestamp: datetime


class AlertListResponse(BaseModel):
    items: list[AlertItem]
    total: int
