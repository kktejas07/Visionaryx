"""
Visioryx - Structured Logging
Production-grade logging configuration.
"""
import logging
import sys
from typing import Any

from app.core.config import get_settings


def setup_logger(name: str = "visioryx") -> logging.Logger:
    """Configure and return application logger."""
    settings = get_settings()
    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)
        formatter = logging.Formatter(
            "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    return logger


def get_logger(name: str = "visioryx") -> logging.Logger:
    """Get or create logger instance."""
    return logging.getLogger(name)


def log_detection(logger: logging.Logger, event_type: str, data: dict[str, Any]) -> None:
    """Log detection events in structured format."""
    logger.info(f"DETECTION | {event_type} | {data}")
