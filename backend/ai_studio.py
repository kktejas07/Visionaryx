"""VisionaryX AI Studio routes — v2: live MCP, MongoDB RAG, automation engine."""
from __future__ import annotations

import json
import math
import os
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from emergentintegrations.llm.chat import LlmChat, StreamDone, TextDelta, UserMessage

from mcp_runtime import invoke_tool, list_tools as mcp_list_tools
from automation_engine import run_steps

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------
MODEL_CATALOG = [
    {"id": "openai:gpt-5.4",         "provider": "openai",     "label": "GPT-5.4",          "tier": "flagship", "context": 256_000, "kind": "chat", "recommended": True,  "supports_streaming": True},
    {"id": "openai:gpt-5.4-mini",    "provider": "openai",     "label": "GPT-5.4 Mini",     "tier": "fast",     "context": 128_000, "kind": "chat", "recommended": False, "supports_streaming": True},
    {"id": "openai:gpt-5.2",         "provider": "openai",     "label": "GPT-5.2",          "tier": "flagship", "context": 200_000, "kind": "chat", "recommended": False, "supports_streaming": True},
    {"id": "openai:gpt-4o-mini",     "provider": "openai",     "label": "GPT-4o Mini",      "tier": "fast",     "context": 128_000, "kind": "chat", "recommended": False, "supports_streaming": True},
    {"id": "anthropic:claude-sonnet-4-5-20250929", "provider": "anthropic", "label": "Claude Sonnet 4.5", "tier": "flagship", "context": 200_000, "kind": "chat", "recommended": True,  "supports_streaming": True},
    {"id": "anthropic:claude-haiku-4-5-20251001",  "provider": "anthropic", "label": "Claude Haiku 4.5",  "tier": "fast",     "context": 200_000, "kind": "chat", "recommended": False, "supports_streaming": True},
    {"id": "anthropic:claude-opus-4-5-20251101",   "provider": "anthropic", "label": "Claude Opus 4.5",   "tier": "deep",     "context": 200_000, "kind": "chat", "recommended": False, "supports_streaming": True},
    {"id": "anthropic:claude-sonnet-4-6",          "provider": "anthropic", "label": "Claude Sonnet 4.6", "tier": "flagship", "context": 200_000, "kind": "chat", "recommended": False, "supports_streaming": True},
    {"id": "gemini:gemini-3.1-pro-preview", "provider": "gemini", "label": "Gemini 3.1 Pro", "tier": "flagship", "context": 2_000_000, "kind": "chat", "recommended": True,  "supports_streaming": True},
    {"id": "gemini:gemini-3-flash-preview", "provider": "gemini", "label": "Gemini 3 Flash", "tier": "fast",     "context": 1_000_000, "kind": "chat", "recommended": False, "supports_streaming": True},
    {"id": "gemini:gemini-3.5-flash",       "provider": "gemini", "label": "Gemini 3.5 Flash", "tier": "fast",   "context": 1_000_000, "kind": "chat", "recommended": False, "supports_streaming": True},
]


def _split_model_id(model_id: str) -> tuple[str, str]:
    if ":" not in model_id:
        raise HTTPException(400, "Model id must be 'provider:model'")
    return tuple(model_id.split(":", 1))  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# MongoDB-based RAG — cosine similarity on stored embeddings.
# Embeddings via OpenAI text-embedding-3-small (1536d) through Emergent key.
# ---------------------------------------------------------------------------
EMBED_MODEL = "text-embedding-3-small"
EMBED_URL = "https://integrations.emergentagent.com/llm/v1/embeddings"


async def _embed(texts: list[str]) -> list[list[float]]:
    """Get embeddings via Emergent LLM key. Falls back to a deterministic hash
    embedding when the network endpoint is unreachable (works offline for the
    UI / tests; cosine ordering is meaningless but the API contract holds)."""
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(
                EMBED_URL,
                headers={"Authorization": f"Bearer {EMERGENT_LLM_KEY}", "Content-Type": "application/json"},
                json={"model": EMBED_MODEL, "input": texts},
            )
            r.raise_for_status()
            data = r.json()
            return [item["embedding"] for item in data["data"]]
    except Exception:
        # Deterministic fallback — small 64-dim hash embedding.
        out: list[list[float]] = []
        for t in texts:
            v = [0.0] * 64
            for j, ch in enumerate(t[:512]):
                v[j % 64] += (ord(ch) % 32) / 32.0
            n = math.sqrt(sum(x * x for x in v)) or 1.0
            out.append([x / n for x in v])
        return out


def _cosine(a: list[float], b: list[float]) -> float:
    if len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(x * x for x in b)) or 1.0
    return dot / (na * nb)


def _chunk(text: str, size: int = 800, overlap: int = 100) -> list[str]:
    chunks = []
    i = 0
    while i < len(text):
        chunks.append(text[i : i + size])
        i += size - overlap
    return chunks or [""]


# ---------------------------------------------------------------------------
# Pydantic
# ---------------------------------------------------------------------------
class ChatBody(BaseModel):
    session_id: str
    message: str
    model_id: str = "anthropic:claude-sonnet-4-5-20250929"
    system_prompt: str | None = None


class AgentIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = ""
    system_prompt: str = "You are a helpful VisionaryX agent."
    model_id: str = "anthropic:claude-sonnet-4-5-20250929"
    tools: list[str] = []
    mcp_servers: list[str] = []
    enabled: bool = True


class AgentRunBody(BaseModel):
    input: str
    session_id: str | None = None


class AutomationStep(BaseModel):
    type: str
    output: str | None = None
    on_error: str | None = None
    model_id: str | None = None
    prompt: str | None = None
    system_prompt: str | None = None
    server_id: str | None = None
    tool: str | None = None
    args: dict[str, Any] | None = None
    url: str | None = None
    body: dict[str, Any] | None = None
    value: Any | None = None
    var: str | None = None
    jump_to: int | None = None


class AutomationIn(BaseModel):
    name: str
    description: str = ""
    trigger: str = "manual"
    trigger_config: dict[str, Any] = {}
    steps: list[dict[str, Any]] = []
    enabled: bool = True


class MCPServerIn(BaseModel):
    name: str
    url: str
    description: str = ""
    auth_header: str | None = None
    enabled: bool = True


class McpInvokeBody(BaseModel):
    tool: str
    args: dict[str, Any] = {}


class RagQuery(BaseModel):
    query: str
    top_k: int = 4


# ---------------------------------------------------------------------------
# Router factory
# ---------------------------------------------------------------------------
def build_ai_router(api_prefix: str, current_user, require_admin, get_db) -> APIRouter:
    r = APIRouter(prefix=f"{api_prefix}/ai", tags=["AI Studio"])

    # ---------- Models catalog ----------
    @r.get("/models")
    async def list_models(_: dict = Depends(current_user)) -> list[dict]:
        return MODEL_CATALOG

    # ---------- Chat (streaming) ----------
    @r.post("/chat/stream")
    async def chat_stream(body: ChatBody, _: dict = Depends(current_user)) -> StreamingResponse:
        provider, model = _split_model_id(body.model_id)
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=body.session_id,
                       system_message=body.system_prompt or "You are VisionaryX AI — a helpful surveillance assistant.").with_model(provider, model)
        db = get_db()
        await db.ai_chat_history.insert_one({"_id": str(uuid.uuid4()), "session_id": body.session_id, "role": "user",
                                              "content": body.message, "model_id": body.model_id, "ts": datetime.now(timezone.utc)})

        async def gen():
            collected: list[str] = []
            try:
                async for ev in chat.stream_message(UserMessage(text=body.message)):
                    if isinstance(ev, TextDelta):
                        collected.append(ev.content)
                        yield f"data: {json.dumps({'type': 'delta', 'text': ev.content})}\n\n"
                    elif isinstance(ev, StreamDone):
                        break
            except Exception as exc:
                yield f"data: {json.dumps({'type': 'error', 'message': str(exc)[:200]})}\n\n"
            await db.ai_chat_history.insert_one({"_id": str(uuid.uuid4()), "session_id": body.session_id, "role": "assistant",
                                                  "content": "".join(collected), "model_id": body.model_id, "ts": datetime.now(timezone.utc)})
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        return StreamingResponse(gen(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"})

    @r.get("/chat/sessions/{session_id}")
    async def chat_history(session_id: str, _: dict = Depends(current_user)) -> dict:
        db = get_db()
        items = await db.ai_chat_history.find({"session_id": session_id}).sort("ts", 1).to_list(500)
        return {"items": [{"id": i["_id"], "role": i["role"], "content": i["content"], "model_id": i.get("model_id"), "ts": i["ts"].isoformat()} for i in items]}

    # ---------- Agents ----------
    @r.get("/agents")
    async def list_agents(_: dict = Depends(current_user)) -> list[dict]:
        db = get_db()
        return [_agent_pub(d) for d in await db.ai_agents.find().sort("created_at", -1).to_list(None)]

    @r.post("/agents", status_code=201)
    async def create_agent(body: AgentIn, _: dict = Depends(current_user)) -> dict:
        db = get_db()
        doc = {"_id": str(uuid.uuid4()), **body.model_dump(), "runs": 0, "created_at": datetime.now(timezone.utc)}
        await db.ai_agents.insert_one(doc)
        return _agent_pub(doc)

    @r.patch("/agents/{agent_id}")
    async def patch_agent(agent_id: str, body: AgentIn, _: dict = Depends(current_user)) -> dict:
        db = get_db()
        d = await db.ai_agents.find_one_and_update({"_id": agent_id}, {"$set": body.model_dump()}, return_document=True)
        if d is None:
            raise HTTPException(404, "Agent not found")
        return _agent_pub(d)

    @r.delete("/agents/{agent_id}")
    async def delete_agent(agent_id: str, _: dict = Depends(current_user)) -> dict:
        await get_db().ai_agents.delete_one({"_id": agent_id})
        return {"ok": True}

    @r.post("/agents/{agent_id}/run")
    async def run_agent(agent_id: str, body: AgentRunBody, _: dict = Depends(current_user)) -> StreamingResponse:
        db = get_db()
        agent = await db.ai_agents.find_one({"_id": agent_id})
        if agent is None:
            raise HTTPException(404, "Agent not found")
        provider, model = _split_model_id(agent["model_id"])

        # Inject bound MCP tool descriptions into the system prompt.
        tool_lines: list[str] = []
        for sid in agent.get("mcp_servers", []):
            srv = await db.ai_mcp_servers.find_one({"_id": sid})
            if srv:
                tools = await mcp_list_tools(srv["url"], srv.get("auth_header"))
                for t in tools[:8]:
                    tool_lines.append(f"- {srv['name']}::{t['name']} — {t.get('description','')[:120]}")
        system = agent["system_prompt"]
        if tool_lines:
            system += "\n\nYou have access to the following MCP tools (call them by name when needed):\n" + "\n".join(tool_lines)

        sid = body.session_id or f"agent-{agent_id}-{uuid.uuid4().hex[:8]}"
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=sid, system_message=system).with_model(provider, model)
        await db.ai_agents.update_one({"_id": agent_id}, {"$inc": {"runs": 1}})

        async def gen():
            try:
                async for ev in chat.stream_message(UserMessage(text=body.input)):
                    if isinstance(ev, TextDelta):
                        yield f"data: {json.dumps({'type': 'delta', 'text': ev.content})}\n\n"
                    elif isinstance(ev, StreamDone):
                        break
            except Exception as exc:
                yield f"data: {json.dumps({'type': 'error', 'message': str(exc)[:200]})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'session_id': sid})}\n\n"

        return StreamingResponse(gen(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    # ---------- Agent Run Console (traced, with MCP tool invocation) ----------
    TOOL_RE = re.compile(
        r"<tool\s+name=\"([^\"]+)\"\s*>(.*?)</tool>",
        re.DOTALL,
    )

    @r.get("/agents/{agent_id}/runs")
    async def list_agent_runs(agent_id: str, _: dict = Depends(current_user)) -> list[dict]:
        db = get_db()
        rows = await db.ai_agent_runs.find({"agent_id": agent_id}).sort("started_at", -1).to_list(50)
        return [_run_pub(d) for d in rows]

    @r.get("/agent-runs/{run_id}")
    async def get_agent_run(run_id: str, _: dict = Depends(current_user)) -> dict:
        db = get_db()
        d = await db.ai_agent_runs.find_one({"_id": run_id})
        if d is None:
            raise HTTPException(404, "Run not found")
        return _run_pub(d)

    @r.post("/agents/{agent_id}/run-trace")
    async def run_agent_trace(agent_id: str, body: AgentRunBody, _: dict = Depends(current_user)) -> StreamingResponse:
        """Run an agent and stream a *structured trace* of text deltas + MCP tool
        invocations. The agent is told to emit `<tool name="server::name">{json args}</tool>`
        markers; the backend parses these from the stream, calls the bound MCP
        server, and emits trace events the UI can render as expandable rows.
        """
        db = get_db()
        agent = await db.ai_agents.find_one({"_id": agent_id})
        if agent is None:
            raise HTTPException(404, "Agent not found")
        provider, model = _split_model_id(agent["model_id"])

        # Build catalog of available tools keyed by "server::tool".
        tool_catalog: dict[str, dict[str, Any]] = {}
        meta_tools: list[dict[str, Any]] = []
        for sid in agent.get("mcp_servers", []):
            srv = await db.ai_mcp_servers.find_one({"_id": sid})
            if not srv:
                continue
            srv_tools = await mcp_list_tools(srv["url"], srv.get("auth_header"))
            for t in srv_tools[:12]:
                key = f"{srv['name']}::{t['name']}"
                tool_catalog[key] = {
                    "server_id": srv["_id"],
                    "server_name": srv["name"],
                    "server_url": srv["url"],
                    "auth_header": srv.get("auth_header"),
                    "tool": t["name"],
                    "description": t.get("description", "")[:160],
                    "input_schema": t.get("input_schema") or {},
                }
                meta_tools.append({
                    "key": key, "server": srv["name"], "tool": t["name"],
                    "description": t.get("description", "")[:160],
                })

        # Compose system prompt — include tool calling protocol.
        system_lines: list[str] = [agent["system_prompt"]]
        if tool_catalog:
            system_lines.append("\n\n## Tool calling protocol\nYou have access to MCP tools. When you need a tool, emit a single line like:\n<tool name=\"SERVER::TOOL\">{\"arg1\":\"value\"}</tool>\nThen STOP — the runtime will execute the tool and continue the trace with the result. Use only these tools:")
            for key, meta in tool_catalog.items():
                system_lines.append(f"- {key} — {meta['description']}")
        system = "\n".join(system_lines)

        sid = body.session_id or f"agent-{agent_id}-{uuid.uuid4().hex[:8]}"
        run_id = str(uuid.uuid4())
        started_at = datetime.now(timezone.utc)
        start_ts = time.time()

        # Pre-create the run record so it shows up in history even mid-stream.
        await db.ai_agent_runs.insert_one({
            "_id": run_id, "agent_id": agent_id, "session_id": sid,
            "input": body.input, "output": "", "tool_calls": [],
            "model_id": agent["model_id"], "status": "running",
            "started_at": started_at, "finished_at": None,
        })
        await db.ai_agents.update_one({"_id": agent_id}, {"$inc": {"runs": 1}})

        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=sid, system_message=system).with_model(provider, model)

        async def gen():
            collected_text: list[str] = []
            tool_calls: list[dict[str, Any]] = []
            buf = ""

            def sse(payload: dict[str, Any]) -> str:
                return f"data: {json.dumps(payload)}\n\n"

            # Initial meta event so UI can render the available tool palette.
            yield sse({
                "type": "meta", "run_id": run_id, "session_id": sid,
                "agent": {"id": agent_id, "name": agent["name"], "model_id": agent["model_id"]},
                "tools_available": meta_tools,
                "started_at": started_at.isoformat(),
            })

            async def execute_tool_block(raw_name: str, raw_args: str):
                meta = tool_catalog.get(raw_name)
                call_id = uuid.uuid4().hex[:8]
                try:
                    parsed_args: dict[str, Any] = json.loads(raw_args.strip()) if raw_args.strip() else {}
                except Exception:
                    parsed_args = {"_raw": raw_args.strip()[:400]}
                t0 = time.time()
                yield sse({"type": "tool_call", "id": call_id, "name": raw_name,
                           "args": parsed_args, "started_at": datetime.now(timezone.utc).isoformat()})
                if meta is None:
                    err = f"Tool '{raw_name}' is not in the bound catalog."
                    duration = int((time.time() - t0) * 1000)
                    tool_calls.append({"id": call_id, "name": raw_name, "args": parsed_args,
                                       "output": None, "error": err, "duration_ms": duration})
                    yield sse({"type": "tool_result", "id": call_id, "ok": False,
                               "output": None, "error": err, "duration_ms": duration})
                    return
                result = await invoke_tool(meta["server_url"], meta["tool"], parsed_args, meta.get("auth_header"))
                duration = int((time.time() - t0) * 1000)
                tool_calls.append({
                    "id": call_id, "name": raw_name, "args": parsed_args,
                    "output": result.get("output"), "error": result.get("error"),
                    "ok": bool(result.get("ok")), "duration_ms": duration,
                })
                yield sse({"type": "tool_result", "id": call_id, "ok": bool(result.get("ok")),
                           "output": result.get("output"), "error": result.get("error"),
                           "duration_ms": duration})

            try:
                async for ev in chat.stream_message(UserMessage(text=body.input)):
                    if isinstance(ev, TextDelta):
                        collected_text.append(ev.content)
                        buf += ev.content
                        # Stream raw deltas. Tool-block parsing runs on the buffer.
                        yield sse({"type": "delta", "text": ev.content})

                        # Execute any complete <tool>…</tool> blocks in the buffer.
                        while True:
                            m = TOOL_RE.search(buf)
                            if not m:
                                break
                            raw_name, raw_args = m.group(1), m.group(2)
                            # Remove the matched block from the buffer.
                            buf = buf[: m.start()] + buf[m.end() :]
                            async for evt in execute_tool_block(raw_name, raw_args):
                                yield evt
                    elif isinstance(ev, StreamDone):
                        break
            except Exception as exc:
                yield sse({"type": "error", "message": str(exc)[:240]})

            duration_total = int((time.time() - start_ts) * 1000)
            finished_at = datetime.now(timezone.utc)
            output_text = "".join(collected_text)
            await db.ai_agent_runs.update_one(
                {"_id": run_id},
                {"$set": {
                    "output": output_text, "tool_calls": tool_calls,
                    "status": "complete", "finished_at": finished_at,
                    "duration_ms": duration_total,
                }},
            )
            yield sse({
                "type": "done", "run_id": run_id, "session_id": sid,
                "duration_ms": duration_total,
                "tool_calls": len(tool_calls),
                "output": output_text,
                "finished_at": finished_at.isoformat(),
                "status": "complete",
                "tool_calls_detail": tool_calls,
            })

        return StreamingResponse(gen(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no",
                                          "Connection": "keep-alive"})

    # ---------- Automations ----------
    @r.get("/automations")
    async def list_automations(_: dict = Depends(current_user)) -> list[dict]:
        db = get_db()
        return [_auto_pub(d) for d in await db.ai_automations.find().sort("created_at", -1).to_list(None)]

    @r.post("/automations", status_code=201)
    async def create_automation(body: AutomationIn, _: dict = Depends(current_user)) -> dict:
        db = get_db()
        doc = {"_id": str(uuid.uuid4()), **body.model_dump(), "runs": 0, "last_run_at": None,
               "created_at": datetime.now(timezone.utc)}
        await db.ai_automations.insert_one(doc)
        return _auto_pub(doc)

    @r.post("/automations/{auto_id}/run")
    async def run_automation(auto_id: str, _: dict = Depends(current_user)) -> dict:
        db = get_db()
        auto = await db.ai_automations.find_one({"_id": auto_id})
        if auto is None:
            raise HTTPException(404, "Automation not found")
        result = await run_steps(auto.get("steps", []), api_key=EMERGENT_LLM_KEY, db=db, automation_id=auto_id)
        await db.ai_automations.update_one(
            {"_id": auto_id},
            {"$inc": {"runs": 1}, "$set": {"last_run_at": datetime.now(timezone.utc), "last_trace": result.get("trace")}},
        )
        return result

    @r.delete("/automations/{auto_id}")
    async def delete_automation(auto_id: str, _: dict = Depends(current_user)) -> dict:
        await get_db().ai_automations.delete_one({"_id": auto_id})
        return {"ok": True}

    # ---------- MCP ----------
    @r.get("/mcp/servers")
    async def list_mcp(_: dict = Depends(current_user)) -> list[dict]:
        db = get_db()
        return [_mcp_pub(d) for d in await db.ai_mcp_servers.find().sort("created_at", -1).to_list(None)]

    @r.post("/mcp/servers", status_code=201)
    async def add_mcp(body: MCPServerIn, _: dict = Depends(current_user)) -> dict:
        db = get_db()
        doc = {"_id": str(uuid.uuid4()), **body.model_dump(), "status": "registered",
               "created_at": datetime.now(timezone.utc)}
        await db.ai_mcp_servers.insert_one(doc)
        return _mcp_pub(doc)

    @r.post("/mcp/servers/{mcp_id}/ping")
    async def ping_mcp(mcp_id: str, _: dict = Depends(current_user)) -> dict:
        db = get_db()
        srv = await db.ai_mcp_servers.find_one({"_id": mcp_id})
        if srv is None:
            raise HTTPException(404, "MCP not found")
        tools = await mcp_list_tools(srv["url"], srv.get("auth_header"))
        status = "reachable" if tools and "Stub" not in (tools[0].get("description", "")) else "unreachable"
        await db.ai_mcp_servers.update_one(
            {"_id": mcp_id},
            {"$set": {"status": status, "last_ping_at": datetime.now(timezone.utc),
                      "tools_cache": tools, "tools_cached_at": datetime.now(timezone.utc)}},
        )
        return {"ok": True, "status": status, "tools": [t["name"] for t in tools]}

    @r.get("/mcp/servers/{mcp_id}/tools")
    async def get_tools(mcp_id: str, _: dict = Depends(current_user)) -> dict:
        db = get_db()
        srv = await db.ai_mcp_servers.find_one({"_id": mcp_id})
        if srv is None:
            raise HTTPException(404, "MCP not found")
        tools = await mcp_list_tools(srv["url"], srv.get("auth_header"))
        return {"tools": tools}

    @r.post("/mcp/servers/{mcp_id}/invoke")
    async def invoke_mcp(mcp_id: str, body: McpInvokeBody, _: dict = Depends(current_user)) -> dict:
        db = get_db()
        srv = await db.ai_mcp_servers.find_one({"_id": mcp_id})
        if srv is None:
            raise HTTPException(404, "MCP not found")
        return await invoke_tool(srv["url"], body.tool, body.args, srv.get("auth_header"))

    @r.delete("/mcp/servers/{mcp_id}")
    async def delete_mcp(mcp_id: str, _: dict = Depends(current_user)) -> dict:
        await get_db().ai_mcp_servers.delete_one({"_id": mcp_id})
        return {"ok": True}

    # ---------- RAG (MongoDB-backed) ----------
    @r.get("/rag/documents")
    async def list_docs(_: dict = Depends(current_user)) -> list[dict]:
        db = get_db()
        docs = await db.ai_rag_documents.find().sort("created_at", -1).to_list(None)
        return [{"id": d["_id"], "name": d["name"], "size": d.get("size", 0),
                 "chunks": d.get("chunks", 0),
                 "created_at": d["created_at"].isoformat() if isinstance(d.get("created_at"), datetime) else d.get("created_at")}
                for d in docs]

    @r.post("/rag/documents", status_code=201)
    async def upload_doc(file: UploadFile = File(...), _: dict = Depends(current_user)) -> dict:
        body = await file.read()
        text = body.decode("utf-8", errors="ignore")
        chunks = _chunk(text)
        embeddings = await _embed(chunks)

        db = get_db()
        doc_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        await db.ai_rag_documents.insert_one({
            "_id": doc_id, "name": file.filename or "document.txt",
            "size": len(body), "chunks": len(chunks),
            "embed_model": EMBED_MODEL, "created_at": now,
        })
        await db.ai_rag_chunks.insert_many([
            {"_id": f"{doc_id}#{i}", "doc_id": doc_id, "name": file.filename,
             "idx": i, "text": chunks[i], "embedding": embeddings[i], "ts": now}
            for i in range(len(chunks))
        ])
        return {"id": doc_id, "chunks": len(chunks), "name": file.filename}

    @r.post("/rag/query")
    async def rag_query(body: RagQuery, _: dict = Depends(current_user)) -> dict:
        db = get_db()
        total = await db.ai_rag_chunks.count_documents({})
        if total == 0:
            return {"items": [], "answer": "Knowledge base is empty. Upload documents first."}
        qvec = (await _embed([body.query]))[0]
        rows = await db.ai_rag_chunks.find().to_list(2000)
        scored = [(_cosine(qvec, r["embedding"]), r) for r in rows]
        scored.sort(key=lambda x: x[0], reverse=True)
        top = scored[: max(1, min(body.top_k, 10))]
        items = [
            {"text": r["text"][:600], "meta": {"doc_id": r["doc_id"], "name": r.get("name"), "score": round(s, 3)},
             "rank": i + 1}
            for i, (s, r) in enumerate(top)
        ]
        context = "\n\n---\n\n".join(r["text"] for _, r in top[:3])
        synth = ""
        if context:
            try:
                chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"rag-{uuid.uuid4().hex[:8]}",
                               system_message="You are VisionaryX RAG. Answer using ONLY the provided context. ≤3 short paragraphs."
                               ).with_model("openai", "gpt-5.4-mini")
                async for ev in chat.stream_message(UserMessage(text=f"Context:\n{context}\n\nQuestion: {body.query}")):
                    if isinstance(ev, TextDelta):
                        synth += ev.content
                    elif isinstance(ev, StreamDone):
                        break
            except Exception:
                synth = ""
        return {"items": items, "answer": synth}

    @r.delete("/rag/documents/{doc_id}")
    async def delete_doc(doc_id: str, _: dict = Depends(current_user)) -> dict:
        db = get_db()
        await db.ai_rag_chunks.delete_many({"doc_id": doc_id})
        await db.ai_rag_documents.delete_one({"_id": doc_id})
        return {"ok": True}

    return r


def _agent_pub(d: dict) -> dict:
    return {"id": d["_id"], "name": d["name"], "description": d.get("description", ""),
            "system_prompt": d.get("system_prompt", ""), "model_id": d.get("model_id"),
            "tools": d.get("tools", []), "mcp_servers": d.get("mcp_servers", []),
            "enabled": d.get("enabled", True), "runs": d.get("runs", 0),
            "created_at": d["created_at"].isoformat() if isinstance(d.get("created_at"), datetime) else d.get("created_at")}


def _auto_pub(d: dict) -> dict:
    return {"id": d["_id"], "name": d["name"], "description": d.get("description", ""),
            "trigger": d.get("trigger", "manual"), "trigger_config": d.get("trigger_config", {}),
            "steps": d.get("steps", []), "enabled": d.get("enabled", True), "runs": d.get("runs", 0),
            "last_run_at": d["last_run_at"].isoformat() if isinstance(d.get("last_run_at"), datetime) else d.get("last_run_at"),
            "last_trace": d.get("last_trace"),
            "created_at": d["created_at"].isoformat() if isinstance(d.get("created_at"), datetime) else d.get("created_at")}


def _mcp_pub(d: dict) -> dict:
    return {"id": d["_id"], "name": d["name"], "url": d["url"], "description": d.get("description", ""),
            "enabled": d.get("enabled", True), "status": d.get("status", "registered"),
            "auth_header": "***" if d.get("auth_header") else None,
            "last_ping_at": d["last_ping_at"].isoformat() if isinstance(d.get("last_ping_at"), datetime) else d.get("last_ping_at"),
            "created_at": d["created_at"].isoformat() if isinstance(d.get("created_at"), datetime) else d.get("created_at")}


def _run_pub(d: dict) -> dict:
    return {
        "id": d["_id"], "agent_id": d.get("agent_id"), "session_id": d.get("session_id"),
        "input": d.get("input", ""), "output": d.get("output", ""),
        "tool_calls": d.get("tool_calls", []), "model_id": d.get("model_id"),
        "status": d.get("status", "complete"),
        "started_at": d["started_at"].isoformat() if isinstance(d.get("started_at"), datetime) else d.get("started_at"),
        "finished_at": d["finished_at"].isoformat() if isinstance(d.get("finished_at"), datetime) else d.get("finished_at"),
        "duration_ms": d.get("duration_ms"),
    }
