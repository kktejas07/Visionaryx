"""
Visioryx - Database Models
SQLAlchemy ORM models for the surveillance system.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    Index,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class User(Base):
    """Registered users with face embeddings."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    image_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    face_embedding: Mapped[Optional[list]] = mapped_column(ARRAY(Float), nullable=True)
    role: Mapped[str] = mapped_column(String(50), default="operator")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    detections = relationship("Detection", back_populates="user")


class Camera(Base):
    """Camera sources for monitoring."""

    __tablename__ = "cameras"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    camera_name: Mapped[str] = mapped_column(String(255), nullable=False)
    rtsp_url: Mapped[str] = mapped_column(String(512), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="inactive", index=True)  # active, inactive, error
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    detections = relationship("Detection", back_populates="camera")
    objects = relationship("ObjectDetection", back_populates="camera")
    alerts = relationship("Alert", back_populates="camera")


class Detection(Base):
    """Face detection events (known/unknown)."""

    __tablename__ = "detections"
    __table_args__ = (
        Index('ix_detections_timestamp', 'timestamp'),
        Index('ix_detections_camera_id', 'camera_id'),
        Index('ix_detections_status', 'status'),
        Index('ix_detections_camera_timestamp', 'camera_id', 'timestamp'),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    camera_id: Mapped[int] = mapped_column(Integer, ForeignKey("cameras.id"), nullable=False, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # known, unknown
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    snapshot: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    bbox: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    camera = relationship("Camera", back_populates="detections")
    user = relationship("User", back_populates="detections")


class ObjectDetection(Base):
    """Object detection events (YOLOv8)."""

    __tablename__ = "objects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    camera_id: Mapped[int] = mapped_column(Integer, ForeignKey("cameras.id"), nullable=False)
    object_name: Mapped[str] = mapped_column(String(100), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    bbox: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    camera = relationship("Camera", back_populates="objects")


class UnknownFace(Base):
    """Unknown face snapshots for clustering."""

    __tablename__ = "unknown_faces"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cluster_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    image: Mapped[str] = mapped_column(String(512), nullable=False)
    embedding: Mapped[list] = mapped_column(ARRAY(Float), nullable=False)
    camera_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("cameras.id"), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Alert(Base):
    """System alerts."""

    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    camera_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("cameras.id"), nullable=True)
    alert_type: Mapped[str] = mapped_column(String(100), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(50), default="info")
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    meta: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)  # renamed from metadata (reserved)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    camera = relationship("Camera", back_populates="alerts")


# Auth model - separate from User for login credentials
class AppSetting(Base):
    """Key-value settings persisted in DB (override env defaults)."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False)


class AuditLog(Base):
    """Admin accountability: who changed what (dashboard actions)."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    actor_email: Mapped[str] = mapped_column(String(255), nullable=False)
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    detail: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AuthUser(Base):
    """Authentication credentials for dashboard access."""

    __tablename__ = "auth_users"
    __table_args__ = (
        Index('ix_auth_users_role', 'role'),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), default="operator", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
