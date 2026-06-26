"""Face detection + recognition pipeline — InsightFace + OpenCV.

Endpoints:
    POST /api/v1/face/detect     — base64 image → bounding boxes + landmarks
    POST /api/v1/face/match      — base64 image → matched users w/ confidence
    POST /api/v1/face/enroll     — base64 image + user_id → stores face embedding
    POST /api/v1/face/enroll/me  — same but for the current user

The model is initialised lazily on first request (cold-start ~2-3 s) so the
server boot is unaffected.
"""
from __future__ import annotations

import base64
import io
from datetime import datetime, timezone
from typing import Any

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import current_user, get_db, require_admin, write_audit

router = APIRouter(prefix="/face", tags=["face"])

_face_app: Any = None
_load_error: str | None = None
_load_attempted = False


def _ensure_model() -> Any:
    """Lazily load the InsightFace model on first use.

    Uses the `buffalo_sc` pack (smaller, ~20 MB) for fast cold-start. Falls back
    to OpenCV's Haar cascade if InsightFace cannot initialise (no network on
    the container, missing onnxruntime providers, etc.).
    """
    global _face_app, _load_error, _load_attempted
    if _face_app is not None:
        return _face_app
    if _load_attempted and _load_error is not None:
        raise HTTPException(status_code=503, detail=f"Face model unavailable: {_load_error}")
    _load_attempted = True
    try:
        from insightface.app import FaceAnalysis  # type: ignore
        app = FaceAnalysis(name="buffalo_sc", providers=["CPUExecutionProvider"], allowed_modules=["detection", "recognition"])
        app.prepare(ctx_id=-1, det_size=(640, 640))
        _face_app = app
        return _face_app
    except Exception as exc:  # noqa: BLE001
        _load_error = str(exc)[:240]
        raise HTTPException(status_code=503, detail=f"Face model unavailable: {_load_error}")


def _decode_image(data_url_or_b64: str) -> "np.ndarray":
    """Accepts a `data:image/...;base64,XXX` URL OR a raw base64 string.
    Returns a BGR ndarray suitable for InsightFace.
    """
    import cv2  # imported lazily
    raw = data_url_or_b64
    if "," in raw and raw.startswith("data:"):
        raw = raw.split(",", 1)[1]
    try:
        binary = base64.b64decode(raw)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid base64 image: {exc}")
    arr = np.frombuffer(binary, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Could not decode image")
    return img


# ---------- Request models ----------
class FaceImageBody(BaseModel):
    image: str  # base64 / data-URL


class FaceEnrollBody(BaseModel):
    image: str
    user_id: str | None = None  # optional — admin can enrol others


# ---------- Endpoints ----------
@router.post("/detect")
async def face_detect(body: FaceImageBody, _: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    """Return bounding boxes for all faces in the image."""
    app = _ensure_model()
    img = _decode_image(body.image)
    faces = app.get(img)
    h, w = img.shape[:2]
    out = []
    for f in faces:
        x1, y1, x2, y2 = [float(v) for v in f.bbox]
        out.append({
            "bbox": {"x": x1 / w, "y": y1 / h, "w": (x2 - x1) / w, "h": (y2 - y1) / h},
            "det_score": float(getattr(f, "det_score", 0.0)),
            "age": int(getattr(f, "age", 0) or 0) or None,
            "gender": int(getattr(f, "gender", -1)) if getattr(f, "gender", None) is not None else None,
        })
    return {"faces": out, "image_size": {"w": w, "h": h}}


@router.post("/match")
async def face_match(body: FaceImageBody, _: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    """Detect faces + match each against enrolled `db.users.face_embedding`."""
    app = _ensure_model()
    img = _decode_image(body.image)
    faces = app.get(img)
    if not faces:
        return {"matches": [], "faces": 0}

    db = get_db()
    enrolled = await db.users.find({"face_embedding": {"$exists": True}}).to_list(None)
    enrolled_pairs = [
        (u, np.asarray(u["face_embedding"], dtype=np.float32))
        for u in enrolled if u.get("face_embedding")
    ]

    h, w = img.shape[:2]
    out = []
    for f in faces:
        emb = getattr(f, "normed_embedding", None)
        if emb is None:
            continue
        emb = np.asarray(emb, dtype=np.float32)
        best_user, best_score = None, -1.0
        for u, ue in enrolled_pairs:
            score = float(np.dot(emb, ue))  # both already L2-normalised
            if score > best_score:
                best_user, best_score = u, score
        x1, y1, x2, y2 = [float(v) for v in f.bbox]
        match = None
        if best_user is not None and best_score >= 0.35:
            match = {
                "user_id": best_user["_id"],
                "email": best_user.get("email"),
                "name": best_user.get("name"),
                "score": round(best_score, 4),
            }
        out.append({
            "bbox": {"x": x1 / w, "y": y1 / h, "w": (x2 - x1) / w, "h": (y2 - y1) / h},
            "det_score": float(getattr(f, "det_score", 0.0)),
            "match": match,
            "status": "known" if match else "unknown",
        })
    return {"matches": out, "faces": len(faces), "enrolled_count": len(enrolled_pairs)}


@router.post("/enroll")
async def face_enroll(
    body: FaceEnrollBody, admin: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    """Compute a face embedding from the supplied image and store it on the
    target user record. Admin only — admins may enrol any user."""
    target_id = body.user_id or admin["id"]
    db = get_db()
    user = await db.users.find_one({"_id": target_id})
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    app = _ensure_model()
    img = _decode_image(body.image)
    faces = app.get(img)
    if not faces:
        raise HTTPException(status_code=400, detail="No face detected in image")
    # Pick the face with highest det_score.
    faces.sort(key=lambda f: float(getattr(f, "det_score", 0.0)), reverse=True)
    f = faces[0]
    emb = getattr(f, "normed_embedding", None)
    if emb is None:
        raise HTTPException(status_code=400, detail="Could not extract face embedding")
    embedding = np.asarray(emb, dtype=np.float32).tolist()
    await db.users.update_one(
        {"_id": target_id},
        {"$set": {"face_embedding": embedding, "has_face_embedding": True}},
    )
    await write_audit(
        action="users.face.enroll", actor=admin,
        resource_type="user", resource_id=target_id,
        detail={"det_score": float(getattr(f, "det_score", 0.0))},
    )
    return {"ok": True, "user_id": target_id, "det_score": float(getattr(f, "det_score", 0.0))}


@router.post("/enroll/me")
async def face_enroll_me(
    body: FaceImageBody, user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    """Self-enroll the current user's face — open to any authenticated role."""
    app = _ensure_model()
    img = _decode_image(body.image)
    faces = app.get(img)
    if not faces:
        raise HTTPException(status_code=400, detail="No face detected in image")
    faces.sort(key=lambda f: float(getattr(f, "det_score", 0.0)), reverse=True)
    f = faces[0]
    emb = getattr(f, "normed_embedding", None)
    if emb is None:
        raise HTTPException(status_code=400, detail="Could not extract face embedding")
    embedding = np.asarray(emb, dtype=np.float32).tolist()
    db = get_db()
    await db.users.update_one(
        {"_id": user["id"]},
        {"$set": {"face_embedding": embedding, "has_face_embedding": True}},
    )
    await write_audit(
        action="users.face.enroll.self", actor=user,
        resource_type="user", resource_id=user["id"],
        detail={"det_score": float(getattr(f, "det_score", 0.0))},
    )
    return {"ok": True, "det_score": float(getattr(f, "det_score", 0.0))}


@router.post("/alerts/unknown-face")
async def report_unknown_face(
    body: dict[str, Any], user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    """Create an alert when FaceLab detects UNKNOWN faces over a consecutive
    window. Frontend calls this after >3 consecutive unknown frames.

    Body: `{ "camera_name": "Webcam · operator-laptop", "det_score": 0.92,
              "consecutive_frames": 5 }`
    """
    from deps import get_db, write_audit  # local import — avoid circular
    db = get_db()
    payload = {
        "_id": __import__("uuid").uuid4().hex,
        "alert_type": "Unrecognized entry",
        "severity": "high",
        "message": f"Unknown face detected over {body.get('consecutive_frames', 3)} consecutive frames",
        "camera_id": body.get("camera_id"),
        "camera_name": body.get("camera_name") or "Webcam · FaceLab",
        "confidence": float(body.get("det_score", 0.0) or 0.0),
        "is_read": False,
        "timestamp": datetime.now(timezone.utc),
        "actor_email": user.get("email"),
    }
    await db.alerts.insert_one(payload)
    await write_audit(
        action="alerts.unknown_face_emitted", actor=user,
        resource_type="alert", resource_id=payload["_id"],
        detail={"camera_name": payload["camera_name"],
                "consecutive_frames": body.get("consecutive_frames")},
    )
    return {"ok": True, "alert_id": payload["_id"]}


@router.get("/status")
async def face_status(_: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    """Lightweight model readiness probe (no model load triggered)."""
    db = get_db()
    enrolled = await db.users.count_documents({"face_embedding": {"$exists": True}})
    return {
        "model": "buffalo_sc",
        "loaded": _face_app is not None,
        "error": _load_error,
        "enrolled_users": enrolled,
    }
