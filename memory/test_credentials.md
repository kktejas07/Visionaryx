# Test Credentials — VisionaryX

Backend reachable at: `${REACT_APP_BACKEND_URL}/api/v1/...`
Local backend port: `8001`
MongoDB DB name: `visionaryx`

## Admin (seeded idempotently on every startup)
- **Email**: `admin@visionaryx.dev`
- **Password**: `VisionX2025!`
- **Role**: `admin`

## Sample operator
- **Email**: `operator@visionaryx.dev`
- **Password**: `Operator2025!`
- **Role**: `operator`

## Auth endpoints
- `POST /api/v1/auth/login` — `{email, password, expires_in_days?}`
- `POST /api/v1/auth/register` — `{email, password, role, name?}`
- `POST /api/v1/auth/forgot-password` — `{email}` (always returns 200 to prevent enumeration)
- `POST /api/v1/auth/change-password` — `{current_password, new_password}` (auth required)
- `GET /api/v1/auth/me` — Bearer token required

## Sample API smoke test
```bash
TOKEN=$(curl -s -X POST $REACT_APP_BACKEND_URL/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@visionaryx.dev","password":"VisionX2025!"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

curl -s -H "Authorization: Bearer $TOKEN" \
  $REACT_APP_BACKEND_URL/api/v1/analytics/overview
```
