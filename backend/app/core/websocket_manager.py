"""
Visioryx - WebSocket Manager
Manages real-time connections for live dashboard updates.
"""
import asyncio
import json
from typing import Any

from app.core.logger import get_logger

logger = get_logger("websocket")


class ConnectionManager:
    """Manages WebSocket connections and broadcasts events."""

    def __init__(self):
        self.active_connections: list[dict] = []

    async def connect(self, websocket, client_id: str):
        """Accept new WebSocket connection."""
        await websocket.accept()
        self.active_connections.append({"id": client_id, "ws": websocket})
        logger.info(f"WebSocket connected: {client_id} (total: {len(self.active_connections)})")

    def disconnect(self, client_id: str):
        """Remove WebSocket connection."""
        self.active_connections = [c for c in self.active_connections if c["id"] != client_id]
        logger.info(f"WebSocket disconnected: {client_id} (total: {len(self.active_connections)})")

    async def broadcast(self, event_type: str, data: dict[str, Any]):
        """Broadcast event to all connected clients."""
        message = json.dumps({"type": event_type, "data": data})
        disconnected = []
        for conn in self.active_connections:
            try:
                await conn["ws"].send_text(message)
            except Exception as e:
                logger.warning(f"Failed to send to {conn['id']}: {e}")
                disconnected.append(conn["id"])

        for cid in disconnected:
            self.disconnect(cid)

    async def send_personal(self, client_id: str, event_type: str, data: dict[str, Any]):
        """Send event to specific client."""
        message = json.dumps({"type": event_type, "data": data})
        for conn in self.active_connections:
            if conn["id"] == client_id:
                try:
                    await conn["ws"].send_text(message)
                    return
                except Exception as e:
                    logger.warning(f"Failed to send to {client_id}: {e}")
                    self.disconnect(client_id)
                break


# Global WebSocket manager instance
ws_manager = ConnectionManager()
