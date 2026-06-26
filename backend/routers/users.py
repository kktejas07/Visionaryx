"""Users endpoints — list, create, patch, delete, enrollment-link."""
from __future__ import annotations

import os
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from deps import current_user, get_db, hash_password, require_admin, write_audit
from schemas import RegisterBody, UserPatch

router = APIRouter(prefix="/users", tags=["users"])

# Note: `current_user` import keeps module dependency complete; unused locally.
_ = current_user


@router.get("")
async def list_users(_: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    db = get_db()
    docs = await db.users.find().sort("created_at", -1).to_list(None)
    items = [
        {
            "id": d["_id"],
            "email": d["email"],
            "role": d.get("role", "operator"),
            "name": d.get("name"),
            "is_active": d.get("is_active", True),
            "has_face_embedding": d.get("has_face_embedding", False),
            "image_path": d.get("image_path"),
            "created_at": d["created_at"].isoformat()
            if isinstance(d.get("created_at"), datetime)
            else d.get("created_at"),
        }
        for d in docs
    ]
    return {"items": items, "total": len(items)}


@router.post("", status_code=201)
async def create_user(
    body: RegisterBody, request: Request, admin: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    db = get_db()
    if await db.users.find_one({"email": body.email.lower()}) is not None:
        raise HTTPException(status_code=409, detail="Email already registered")
    doc = {
        "_id": str(uuid.uuid4()),
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "name": body.name,
        "role": body.role,
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(doc)
    await write_audit(
        action="users.create", actor=admin, request=request,
        resource_type="user", resource_id=doc["_id"],
        detail={"email": doc["email"], "role": doc["role"]},
    )
    return {
        "id": doc["_id"],
        "email": doc["email"],
        "role": doc["role"],
        "name": doc["name"],
        "created_at": doc["created_at"].isoformat(),
    }


@router.patch("/{user_id}")
async def patch_user(
    user_id: str, body: UserPatch, request: Request, admin: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    db = get_db()
    update = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    r = await db.users.find_one_and_update(
        {"_id": user_id}, {"$set": update}, return_document=True,
    )
    if r is None:
        raise HTTPException(status_code=404, detail="User not found")
    await write_audit(
        action="users.update", actor=admin, request=request,
        resource_type="user", resource_id=user_id,
        detail={"fields": list(update.keys()), "email": r.get("email")},
    )
    return {
        "id": r["_id"],
        "email": r["email"],
        "role": r.get("role", "operator"),
        "name": r.get("name"),
    }


@router.delete("/{user_id}")
async def delete_user(
    user_id: str, request: Request, admin: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    db = get_db()
    target = await db.users.find_one({"_id": user_id})
    r = await db.users.delete_one({"_id": user_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    await write_audit(
        action="users.delete", actor=admin, request=request,
        resource_type="user", resource_id=user_id,
        detail={"email": (target or {}).get("email")},
    )
    return {"ok": True}


@router.post("/{user_id}/enrollment-link")
async def users_enrollment_link(
    user_id: str, _: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    db = get_db()
    user = await db.users.find_one({"_id": user_id})
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    token = secrets.token_urlsafe(24)
    base = os.environ.get("APP_URL", "")
    return {
        "ok": True,
        "sent_to": user.get("email"),
        "enroll_url": f"{base}/enroll/{token}" if base else f"/enroll/{token}",
    }
