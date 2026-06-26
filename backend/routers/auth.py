"""Auth endpoints — login, register, forgot, change, me."""
from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from deps import (
    ACCESS_TOKEN_DEFAULT_DAYS,
    ACCESS_TOKEN_REMEMBER_DAYS,
    create_access_token,
    current_user,
    get_db,
    hash_password,
    verify_password,
    write_audit,
)
from schemas import (
    ChangePasswordBody,
    ForgotPasswordBody,
    LoginBody,
    RegisterBody,
    TokenResponse,
    UserPublic,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginBody, request: Request) -> TokenResponse:
    db = get_db()
    user = await db.users.find_one({"email": body.email.lower()})
    if user is None or not verify_password(body.password, user["password_hash"]):
        await write_audit(
            action="auth.login.failed", request=request,
            actor={"email": body.email.lower()},
            detail={"reason": "invalid_credentials"},
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")
    days = ACCESS_TOKEN_REMEMBER_DAYS if (body.expires_in_days or 0) >= 30 else ACCESS_TOKEN_DEFAULT_DAYS
    token = create_access_token(user["_id"], user["email"], user["role"], days)
    await write_audit(
        action="auth.login", request=request,
        actor={"id": user["_id"], "email": user["email"], "role": user["role"]},
        detail={"remember": days == ACCESS_TOKEN_REMEMBER_DAYS},
    )
    return TokenResponse(access_token=token, expires_in=days * 86400)


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterBody) -> TokenResponse:
    db = get_db()
    if await db.users.find_one({"email": body.email.lower()}) is not None:
        raise HTTPException(status_code=409, detail="Email already registered")
    user_doc = {
        "_id": str(uuid.uuid4()),
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "name": body.name,
        "role": body.role,
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(user_doc)
    token = create_access_token(user_doc["_id"], user_doc["email"], user_doc["role"], ACCESS_TOKEN_DEFAULT_DAYS)
    return TokenResponse(access_token=token, expires_in=ACCESS_TOKEN_DEFAULT_DAYS * 86400)


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordBody) -> dict[str, Any]:
    db = get_db()
    user = await db.users.find_one({"email": body.email.lower()})
    if user is not None:
        token = secrets.token_urlsafe(32)
        await db.password_resets.insert_one(
            {
                "_id": str(uuid.uuid4()),
                "user_id": user["_id"],
                "token": token,
                "expires_at": datetime.now(timezone.utc) + timedelta(hours=1),
                "used": False,
            }
        )
    return {"ok": True, "message": "If that email exists, a reset link has been sent."}


@router.post("/change-password")
async def change_password(body: ChangePasswordBody, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    db = get_db()
    full = await db.users.find_one({"_id": user["id"]})
    if full is None or not verify_password(body.current_password, full["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    await db.users.update_one(
        {"_id": user["id"]},
        {"$set": {"password_hash": hash_password(body.new_password)}},
    )
    return {"ok": True}


@router.get("/me", response_model=UserPublic)
async def me(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return user
