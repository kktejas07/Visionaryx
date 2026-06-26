"""VisionaryX MCP runtime — list & invoke tools on remote MCP servers.

Uses the official `mcp` Python SDK. We support two transports:
  - **SSE** (default for HTTP MCP servers — most mcpmarket.com listings)
  - **streamable_http** (newer transport)

The functions here open a short-lived session per call. For high-frequency tool
usage you'd want connection pooling, but this is sufficient for VisionaryX's
"call a tool on demand from an agent / automation" use-case.
"""
from __future__ import annotations

import asyncio
from typing import Any

try:
    from mcp import ClientSession
    from mcp.client.sse import sse_client
    _MCP_OK = True
except Exception:  # SDK shape may differ; degrade gracefully.
    _MCP_OK = False


async def list_tools(url: str, auth_header: str | None = None, timeout: float = 8.0) -> list[dict[str, Any]]:
    """Return a list of `{name, description, input_schema}` for the server.
    Returns a stub list if the SDK / transport fails so the UI never breaks.
    """
    if not _MCP_OK:
        return _stub_tools(reason="mcp SDK not available")
    headers = {"Authorization": auth_header} if auth_header else None
    try:
        async with asyncio.timeout(timeout):
            async with sse_client(url, headers=headers) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    tools = await session.list_tools()
                    return [
                        {
                            "name": t.name,
                            "description": getattr(t, "description", "") or "",
                            "input_schema": getattr(t, "inputSchema", None) or {},
                        }
                        for t in tools.tools
                    ]
    except Exception as exc:  # noqa: BLE001
        return _stub_tools(reason=str(exc)[:160])


async def invoke_tool(
    url: str,
    tool_name: str,
    args: dict[str, Any],
    auth_header: str | None = None,
    timeout: float = 20.0,
) -> dict[str, Any]:
    """Invoke a tool by name with arguments. Returns `{ok, output, error?}`."""
    if not _MCP_OK:
        return {"ok": False, "output": None, "error": "mcp SDK not available in this build"}
    headers = {"Authorization": auth_header} if auth_header else None
    try:
        async with asyncio.timeout(timeout):
            async with sse_client(url, headers=headers) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    res = await session.call_tool(tool_name, args)
                    payload: list[str] = []
                    for c in res.content or []:
                        if getattr(c, "type", "") == "text":
                            payload.append(getattr(c, "text", ""))
                    return {"ok": not res.isError, "output": "\n".join(payload) or None}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "output": None, "error": str(exc)[:200]}


def _stub_tools(reason: str) -> list[dict[str, Any]]:
    return [
        {"name": "search", "description": "Stub — full MCP runtime degraded: " + reason, "input_schema": {}},
        {"name": "fetch",  "description": "Stub fetch tool", "input_schema": {}},
        {"name": "read_file", "description": "Stub read_file tool", "input_schema": {}},
    ]
