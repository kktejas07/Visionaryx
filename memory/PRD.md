# VisionaryX AI — Product Requirements (PRD)

## Original Problem Statement
> "can you start improve the code and UI for Visionry X for both mobile and web version should be react native and MVVM arch this is the brand identiy link … its security surveillance"

User then uploaded the official **VisionaryX AI Brand book v1** (Geist + IBM Plex Mono/Sans, Indigo `#4F46E5 → #7C3AED` gradient, viewfinder X mark, "INTELLIGENT · SECURITY · SURVEILLANCE" voice).

## Architecture

```
/app/
├── backend/                 FastAPI + MongoDB (port 8001), 34/34 pytest passing
│   └── server.py            Auth, analytics (real % deltas), cameras, alerts,
│                            detections, users, audit, settings, WebSocket /ws,
│                            45s demo broadcast loop, enrollment upload
│
└── frontend/                Single React Native + RN-Web codebase (Expo Router)
    ├── app/
    │   ├── _layout.tsx          Root: DesktopShell wraps Stack
    │   ├── login.tsx            MVVM
    │   ├── index.tsx            Boot/redirect
    │   ├── (tabs)/
    │   │   ├── _layout.tsx      Mobile bottom-tabs (hidden on desktop)
    │   │   ├── index.tsx        Overview — MVVM, real trend %
    │   │   ├── live.tsx         MVVM
    │   │   ├── cameras.tsx      MVVM
    │   │   ├── alerts.tsx       MVVM
    │   │   ├── enroll.tsx       Cross-platform face enrollment
    │   │   └── more.tsx         User pill + shortcuts
    │   ├── detections.tsx       MVVM
    │   ├── analytics.tsx        Charts + KPIs
    │   ├── users.tsx            MVVM, admin-only CRUD
    │   ├── audit.tsx            Compliance feed
    │   └── settings.tsx         SMTP config + test
    │
    ├── components/
    │   ├── DesktopShell.tsx     260px side-nav wrapper (≥1024px, all routes)
    │   ├── VisionaryXLogo.tsx   4 variants: app/mark/wordmark/stacked
    │   ├── CommandBackground.tsx Grid + indigo radial glow
    │   └── vx/                  VxButton, VxInput, VxCard, ErrorBanner, …
    │
    ├── viewmodels/              MVVM layer
    │   ├── repositories/        AuthRepository, DashboardRepository, AlertsRepository, CamerasRepository
    │   ├── models/              UserModel, AlertModel, CameraModel, DashboardModel
    │   ├── useLoginViewModel.ts
    │   ├── useDashboardViewModel.ts
    │   ├── useAlertsViewModel.ts
    │   ├── useCamerasViewModel.ts
    │   ├── useDetectionsViewModel.ts
    │   └── useUsersViewModel.ts
    │
    ├── contexts/
    │   ├── AuthContext.tsx
    │   └── RealtimeContext.tsx  WebSocket /api/v1/ws?token=… (auto-reconnect,
    │                            heartbeat, AppState resume)
    │
    └── constants/visionTheme.ts Official brand tokens
```

## Brand Identity (VisionaryX AI v1)
- **Colors**: Indigo Primary `#4F46E5 → #7C3AED` gradient · Indigo 300 `#818CF8` · Indigo 400 `#6366F1` · Live Cyan `#22D3EE` · Void `#07070B` · Surface `#0F0F17` · Elevated `#16161F` · Line `#24242F` · Ash `#9A9AAB` · Mist `#F4F4F8`
- **Type**: **Geist** (Display/Wordmark, 500/600/700) + **IBM Plex Sans** (Body/UI) + **IBM Plex Mono** (Data/Labels)
- **Logo**: Gradient squircle + white X on 45° grid + 4 lavender viewfinder corner ticks (NO glow per brand rule)
- **Voice**: `INTELLIGENT · SECURITY · SURVEILLANCE` + "Vision that watches, recognises and protects."

## MVVM Pattern
| Layer | Example | Knows about |
|---|---|---|
| Repository | `AuthRepository.login()` | `fetch` + endpoints |
| Model | `UserModel`, `AlertModel`, `CameraModel`, `DetectionItem`, `UserItem` | Just shape |
| ViewModel | `useLoginViewModel`, `useDashboardViewModel`, `useAlertsViewModel`, `useCamerasViewModel`, `useDetectionsViewModel`, `useUsersViewModel` | State, actions, derived vals |
| View | All screens in `app/` | Layout + styling only |

## What's been implemented (2026-06-17 / 06-18 / 06-23 / 06-24 / 06-26)
- ✅ **Camera View modal — real live MJPEG (06-26 evening)** — `routers/camera_stream.py` generates synthetic CCTV-styled JPEG frames per camera (Pillow + numpy, no GPU). Two endpoints: `GET /api/v1/cameras/{id}/preview.jpg` (single frame, ~20KB) and `GET /api/v1/cameras/{id}/stream.mjpeg` (10fps multipart/x-mixed-replace). JWT via `?token=` query param so `<img>` tags can authenticate. Frame shows camera name + status dot + LIVE pill + moving violet scan-line + grid + corner brackets + live timestamp + cycling channel #. View modal in `/cameras` now embeds this stream — confirmed rendering live with timestamp ticking.
- ✅ **Face recognition pipeline (06-26)** — InsightFace `buffalo_sc` + OpenCV + ONNX Runtime on backend. New `routers/face.py` exposes `/detect`, `/match`, `/enroll`, `/enroll/me`, `/status`. Lazy-loaded model (~2-3s cold start). Cosine similarity threshold 0.35. FaceLab UI on Live screen: webcam → 500ms JPEG capture → backend match → animated corner-bracket overlay with linear interpolation. Stats row: faces / latency / enrolled / status.
- ✅ **Camera View modal — real live MJPEG (06-26 evening)** — `routers/camera_stream.py` generates synthetic CCTV-styled JPEG frames per camera (Pillow + numpy). Two endpoints: `GET /api/v1/cameras/{id}/preview.jpg` (single frame) and `GET /api/v1/cameras/{id}/stream.mjpeg` (10fps multipart). JWT via `?token=` query param. Frame: camera name + status dot + LIVE pill + scan-line + grid + corner brackets + timestamp + channel. View modal in `/cameras` embeds the stream.
- ✅ **EnrollMyFace component (06-26 evening)** — Settings → Account → Biometrics card. Webcam → POST `/api/v1/face/enroll/me` → backend extracts InsightFace embedding → stores on user record. Audit-logged as `users.face.enroll.self`.
   • `POST /api/v1/face/detect` — base64 image → face bboxes + landmarks
   • `POST /api/v1/face/match` — base64 image → matches against `db.users.face_embedding`
   • `POST /api/v1/face/enroll` (admin) — store embedding for any user
   • `POST /api/v1/face/enroll/me` — self-enroll
   • `GET /api/v1/face/status` — model readiness
   Lazy-loaded on first request (~2-3s cold start). Cosine similarity threshold 0.35.
- ✅ **FaceLab UI (06-26)** — `/components/FaceLab.tsx` mounted on Live screen. Webcam → JPEG capture every 500ms → backend match → animated bounding-box overlay with **linear interpolation between frames** (no jumpy boxes). Corner-bracket "tracker" style, label with name + confidence %, mirror-flipped. Stats row: faces / latency / enrolled / status. Native shows web-only placeholder card.
- ✅ **Camera row: View + Edit + Delete (06-26)** — three icon buttons per row. View modal shows live-preview placeholder + status + URL metadata + "Edit" jump. Edit modal allows rename + URL change + enabled toggle, calls new `useCamerasViewModel.update()`.
- ✅ **Side menu width: 260 → 288 (06-26)** — wider, more comfortable nav rail.
- ✅ **Activity Stream auto-refresh (06-26)** — polls every 15s + WS-tick refresh. Inline actions: **ACK** button on alerts (PATCH `/alerts/{id}/read`), **RE-RUN** button on agent runs (routes to console).
- ✅ **MongoDB Atlas migration (06-24)** — backend running on `visionaryx.ld24mza.mongodb.net`. ⚠️ Credentials shared in chat — **rotate them**.
- ✅ MongoDB FastAPI on port 8001, 34/34 pytest pass (legacy local-Mongo tests)
- ✅ Seeded admin/operator + 6 demo cameras + 24 alerts + 30 days of trend data
- ✅ Replaced Next.js frontend with Expo Router; `/app/_legacy_frontend_nextjs` archived
- ✅ Single React Native + RN-Web codebase serves iOS / Android / Web from `yarn start` (Expo Web on port 3000)
- ✅ Web-safe token storage (localStorage fallback for `expo-secure-store`)
- ✅ **Official VisionaryX AI brand identity applied** across ALL 12 screens
- ✅ MVVM scaffolding: 4 repositories, 7 models, 6 ViewModels
- ✅ **Real WebSocket `/api/v1/ws?token=<jwt>`** — welcome event, ping/pong heartbeat, 45s demo broadcast loop, auto-reconnect, AppState resume
- ✅ **Real `detection_trend_7d` %** computed from `db.alerts` windowed counts
- ✅ **Responsive `DesktopShell`** — 260px side-nav on ≥1024px
- ✅ Realtime user-pill: cyan dot when WebSocket connected, amber when idle
- ✅ **AI Studio**: Live MCP tool invocation via Python SDK, Automation step engine, Agent tool-binding UI, RAG on MongoDB + Emergent embeddings
- ✅ **Theme polish 06-23**: Electric Violet `#8B5CF6` primary, Space Grotesk display + Roboto body + JetBrains Mono data
- ✅ **Agent Run Console (06-23)** — `/ai/agents/[id]/console`. Live SSE trace viewer with:
   • Streamed text deltas + blinking cursor
   • Expandable MCP tool-call rows (name, args JSON, output, duration ms)
   • Two-pane layout on desktop (history rail + live canvas), single column on mobile
   • Status pill: READY → STREAMING → COMPLETE / CANCELLED / ERROR
   • Replay any past run from the history rail
   • Cancel mid-stream via AbortController
   • New backend endpoints: `POST /api/v1/ai/agents/{id}/run-trace` (SSE), `GET .../runs`, `GET /api/v1/ai/agent-runs/{id}`
   • New DB collection: `ai_agent_runs`
   • LLM is instructed via system prompt to emit `<tool name="SERVER::TOOL">{args}</tool>` markers; backend parses, invokes MCP, emits `tool_call`/`tool_result` trace events
- ✅ **UI polish 06-23** across:
   • Sidebar — icon backdrops on active items, section dividers, refined spacing
   • AI Studio tiles — icon top-left + arrow chip top-right, footer "OPEN MODULE" with violet dot
   • Login — gradient "Vision" word, glass card with backdrop-filter
   • Dashboard — KPI top accent line (violet, red for danger), gradient activity bars
- ✅ **Light-mode toggle (06-23)** — Toggle in user pill (sun/moon icon, `data-testid=sidenav-theme-toggle`) AND in Settings → Appearance card (deep space dark / soft mist light radio cards). Persisted via localStorage / SecureStore. **Implementation**: foundational palette tokens (bg, surface*, text*, border*, glass*) emitted as `var(--vx-<token>, fallback)` on web; `<VxThemeStyles>` injects light + dark variable sets keyed on `[data-vx-theme]` so the entire app flips instantly without per-screen refactor. Native shows the toggle but always renders dark (light wiring deferred to per-screen pass).
- ✅ **Activity Stream widget (06-24)** — unified chronological feed on Dashboard merging `audit_logs` + `ai_agent_runs` + `alerts`. New `GET /api/v1/activity?limit=N` endpoint with role-aware filtering (admins see audit; others see only own runs + alerts). UI: color-coded rows (cyan AUDIT, violet ALERT, electric-violet AGENT_RUN), icon badges, relative times ("4m ago"), inline metadata (IP for audit, duration/tool count for runs, severity for alerts), clickable rows route to detail screens. Live pill animates with the WS tick. New router `routers/activity.py`.
- ✅ **Native light-mode (full screen coverage)** — refactored 20 screen roots to `backgroundColor: 'transparent'` so the Stack's dynamic `contentStyle.backgroundColor` shows through on native (already dynamic from `_layout.tsx` via the `useColorMode()` hook). Combined with the existing primitives + chrome refactor (CommandBackground, tab bar, GlassCard, all vx primitives), every screen on native now flips when the toggle is hit.
- ✅ **Server.py modular split (06-23 — phase 2 complete)** — extracted shared deps (`deps.py`) + Pydantic models (`schemas.py`) + 8 router files (`routers/{auth,users,analytics,cameras,alerts,detections,settings,activity}.py`). server.py dropped from 1117 → ~595 lines.
- ✅ **Real detection-status persistence (06-23)** — `/analytics/detection-status-trends` and `/analytics/object-stats` now compute real known/unknown splits + per-object-class counts from `db.alerts` via Mongo aggregation pipelines. Random-mock removed.
- ✅ **Native light-mode (06-23 — chrome layer)** — refactored `(tabs)/_layout.tsx` tab bar, `CommandBackground`, `GlassCard`, all vx primitives (`SectionEyebrow`, `ScreenTitle`, `ScreenSub`, `VxCard`, `VxButton`, `VxInput`, `ErrorBanner`) to consume `useColors()` at render time. iOS/Android tab bar + screen backgrounds + glass surfaces + buttons + inputs all flip with the theme toggle. Inner screen StyleSheets that still use static palette tokens render fine over the dynamic background.
- ✅ **Persisted audit log (06-23)** — `db.audit_logs` collection with indexes on `created_at` + `actor_email`. `write_audit()` helper wired into: `auth.login`, `auth.login.failed`, `users.create`, `users.update`, `users.delete`, `settings.email.update`, `system.start`. `GET /api/v1/audit` supports `?actor=<substr>&action=<exact>&limit&offset`.
- ✅ **Audit Log dashboard (06-23)** — `/audit` redesigned: color-coded action chips, actor + action filters, CSV export, IP/actor/detail JSON per row.
- ✅ **Richer Agent Run Console `done` event (06-23)** — SSE final event now includes `output`, `finished_at`, `status`, `tool_calls_detail` so the UI updates history optimistically with zero follow-up GET.

## Backlog
**P2 — Polish + production**
- Real persisted audit log (currently stub returns one hard-coded entry)
- Persist known/unknown split for `detection-status-trends` (currently random)
- DB-aggregated `object-stats` (currently static array)
- Split `server.py` (~1000 lines) into routers/{auth,analytics,cameras,…}
- Migrate RN-Web deprecated `shadow*` → `boxShadow`

**P3 — Heavy AI pipeline (deferred)**
- Re-introduce InsightFace + OpenCV face recognition (needs Linux worker + persistent storage)
- Multi-camera HLS streaming via `expo-video`
- Light-mode toggle (Mist palette already in tokens)

## Honest status
- All 12 screens render in the new brand on both web (RN-Web) and mobile (RN)
- The heavy AI pipeline from original Visioryx is NOT ported — `enroll/upload-session` accepts files and returns success but does not index. The `_demo_event_loop` emits a fake alert every 45s so the realtime UI demonstrably reacts even without the pipeline.

## Tests
- Backend: `python -m pytest backend/tests/backend_test.py -v --asyncio-mode=auto` → 34/34 ✓
- Test reports: `/app/test_reports/iteration_{1,2,3}.json`
- Test credentials: `/app/memory/test_credentials.md`
