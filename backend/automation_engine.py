"""Automation step engine — sequential workflow runner.

Supported step types:
  - `llm`     : call a model with a prompt template (vars from `ctx`)
  - `mcp`     : invoke a tool on a registered MCP server
  - `webhook` : POST to a URL with a JSON body
  - `condition`: branch on a boolean expression (truthy check against ctx)
  - `set`     : write a literal value into the context

Each step writes its result into `ctx[step["output"]]` (default: `step_{i}`).
Templating uses simple `{ctx.var}` substitution — no eval.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

import httpx
from emergentintegrations.llm.chat import LlmChat, StreamDone, TextDelta, UserMessage

from mcp_runtime import invoke_tool

_TEMPLATE_RE = re.compile(r"\{ctx\.([a-zA-Z0-9_]+)\}")


def _render(template: str, ctx: dict[str, Any]) -> str:
    if not isinstance(template, str):
        return template
    return _TEMPLATE_RE.sub(lambda m: str(ctx.get(m.group(1), "")), template)


async def run_steps(
    steps: list[dict[str, Any]],
    api_key: str,
    initial_ctx: dict[str, Any] | None = None,
    db=None,
    automation_id: str | None = None,
) -> dict[str, Any]:
    ctx: dict[str, Any] = dict(initial_ctx or {})
    trace: list[dict[str, Any]] = []
    skip_until: int | None = None

    for i, step in enumerate(steps):
        if skip_until is not None and i < skip_until:
            continue
        kind = step.get("type")
        out_key = step.get("output", f"step_{i}")
        started = datetime.now(timezone.utc)
        try:
            if kind == "llm":
                model_id = step.get("model_id", "openai:gpt-5.4-mini")
                provider, model = model_id.split(":", 1)
                prompt = _render(step.get("prompt", ""), ctx)
                system = _render(step.get("system_prompt", "You are a helpful assistant."), ctx)
                chat = LlmChat(api_key=api_key, session_id=f"auto-{automation_id or 'adhoc'}-{i}",
                               system_message=system).with_model(provider, model)
                collected: list[str] = []
                async for ev in chat.stream_message(UserMessage(text=prompt)):
                    if isinstance(ev, TextDelta):
                        collected.append(ev.content)
                    elif isinstance(ev, StreamDone):
                        break
                ctx[out_key] = "".join(collected)

            elif kind == "mcp":
                if db is None:
                    raise RuntimeError("mcp step requires db handle")
                server_id = step.get("server_id")
                tool = step.get("tool")
                args = step.get("args") or {}
                rendered = {k: _render(v, ctx) for k, v in args.items()}
                doc = await db.ai_mcp_servers.find_one({"_id": server_id})
                if doc is None:
                    raise RuntimeError(f"MCP server {server_id} not found")
                res = await invoke_tool(doc["url"], tool, rendered, doc.get("auth_header"))
                ctx[out_key] = res

            elif kind == "webhook":
                url = _render(step.get("url", ""), ctx)
                body = step.get("body") or {}
                rendered_body = {k: _render(v, ctx) for k, v in body.items()}
                async with httpx.AsyncClient(timeout=10.0) as client:
                    r = await client.post(url, json=rendered_body)
                ctx[out_key] = {"status": r.status_code, "body": r.text[:500]}

            elif kind == "condition":
                expr_key = step.get("var", "")
                truthy = bool(ctx.get(expr_key))
                jump = step.get("jump_to") if not truthy else None
                ctx[out_key] = truthy
                if isinstance(jump, int):
                    skip_until = jump

            elif kind == "set":
                ctx[out_key] = step.get("value")

            else:
                ctx[out_key] = {"error": f"unknown step type: {kind}"}

            trace.append({
                "step": i,
                "type": kind,
                "ok": True,
                "duration_ms": int((datetime.now(timezone.utc) - started).total_seconds() * 1000),
                "output_key": out_key,
            })
        except Exception as exc:  # noqa: BLE001 — step-level error containment
            trace.append({
                "step": i, "type": kind, "ok": False,
                "duration_ms": int((datetime.now(timezone.utc) - started).total_seconds() * 1000),
                "error": str(exc)[:200],
            })
            if step.get("on_error") == "continue":
                continue
            return {"ok": False, "ctx": ctx, "trace": trace}

    return {"ok": True, "ctx": ctx, "trace": trace}
