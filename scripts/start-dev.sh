#!/bin/bash
# Visioryx - Start dev (kills busy ports 3000/8000/8080 first)
# Usage: ./scripts/start-dev.sh [backend|frontend|mobile|all]

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Prefer Python 3.10+ when available
pick_python() {
    for cmd in python3.12 python3.11 python3.10 python3; do
        if command -v "$cmd" >/dev/null 2>&1 && "$cmd" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
            echo "$cmd"
            return 0
        fi
    done
    if command -v python3 >/dev/null 2>&1; then
        echo "python3"
        return 0
    fi
    echo ""
}

PYTHON_CMD="$(pick_python)"
if [ -z "$PYTHON_CMD" ]; then
    echo "Error: python3 not found"
    exit 1
fi
if ! "$PYTHON_CMD" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
    echo "Warning: $PYTHON_CMD is below 3.10. Visioryx targets Python 3.10+; install via https://www.python.org or: brew install python@3.12"
fi

kill_port() {
    local port=$1
    local pids
    pids=$(lsof -ti :"$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo "Killing process(es) on port $port: $pids"
        echo "$pids" | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
}

# Host + port from backend/.env (DATABASE_URL_SYNC / DATABASE_URL). Default 5433 = docker-compose.dev.yml publish port.
db_check_target() {
    local envf="$PROJECT_ROOT/backend/.env" raw="" host="127.0.0.1" port="5433"
    if [ -f "$envf" ]; then
        raw=$(grep -E '^[[:space:]]*DATABASE_URL_SYNC=' "$envf" 2>/dev/null | tail -1 | sed 's/^[^=]*=//' | tr -d '\r' | sed 's/^"\(.*\)"$/\1/' | sed "s/^'\(.*\)'$/\1/")
        [ -z "$raw" ] && raw=$(grep -E '^[[:space:]]*DATABASE_URL=' "$envf" 2>/dev/null | tail -1 | sed 's/^[^=]*=//' | tr -d '\r' | sed 's/^"\(.*\)"$/\1/' | sed "s/^'\(.*\)'$/\1/")
    fi
    if [ -n "$raw" ]; then
        local hp
        hp=$(printf '%s' "$raw" | sed -E 's|^[a-z+]*://[^@]+@||; s|/.*||')
        if [ -n "$hp" ]; then
            case "$hp" in
                *:*)
                    host="${hp%%:*}"
                    port="${hp##*:}"
                    ;;
                *)
                    host="$hp"
                    port="5432"
                    ;;
            esac
        fi
    fi
    case "$host" in
        localhost | ::1) host="127.0.0.1" ;;
    esac
    printf '%s %s\n' "$host" "$port"
}

maybe_start_docker_postgres() {
    local host port
    read -r host port < <(db_check_target)
    if ! command -v nc >/dev/null 2>&1; then
        return 0
    fi
    if nc -z "$host" "$port" 2>/dev/null; then
        return 0
    fi
    if [ "$host" != "127.0.0.1" ]; then
        return 0
    fi
    if ! command -v docker >/dev/null 2>&1; then
        return 0
    fi
    if ! docker info >/dev/null 2>&1; then
        echo ""
        echo "PostgreSQL is not reachable on ${host}:${port} and Docker is not running."
        echo "  Start Docker Desktop, then re-run this script (or start Postgres yourself on that port)."
        echo ""
        return 0
    fi
    echo "PostgreSQL not reachable on ${host}:${port} — starting dev DB with Docker (service: db)..."
    if ! docker compose -f "$PROJECT_ROOT/docker/docker-compose.dev.yml" up -d db; then
        echo "ERROR: docker compose up failed."
        return 1
    fi
    echo "Waiting for Postgres on ${host}:${port}..."
    local i
    for i in $(seq 1 45); do
        if nc -z "$host" "$port" 2>/dev/null; then
            echo "Postgres is accepting connections."
            return 0
        fi
        sleep 1
    done
    echo "ERROR: Timed out waiting for Postgres on ${host}:${port}."
    return 1
}

setup_db() {
    (
        cd "$PROJECT_ROOT/backend" || exit 1
        export PYTHONPATH=.
        # Same interpreter as start_backend: venv if usable, else $PYTHON_CMD (no hard venv requirement)
        PY="$PYTHON_CMD"
        if [ -f "venv/bin/activate" ]; then
            # shellcheck source=/dev/null
            . venv/bin/activate
            PY="python"
        elif [ -f "venv/Scripts/activate" ]; then
            # shellcheck source=/dev/null
            . venv/Scripts/activate
            PY="python"
        fi
        echo "Running database migrations..."
        read -r _PG_HOST _PG_PORT < <(db_check_target)
        if ! maybe_start_docker_postgres; then
            exit 1
        fi
        if command -v nc >/dev/null 2>&1 && ! nc -z "$_PG_HOST" "$_PG_PORT" 2>/dev/null; then
            echo ""
            echo "WARNING: Nothing is accepting connections on ${_PG_HOST}:${_PG_PORT} (from backend/.env or default 5433)."
            echo "  Start the dev database from the project root:"
            echo "    docker compose -f \"$PROJECT_ROOT/docker/docker-compose.dev.yml\" up -d"
            echo "  Ensure backend/.env DATABASE_URL* host:port match docker-compose (Visioryx uses host port 5433). See backend/.env.example."
            echo ""
        fi
        if ! "$PY" -m alembic upgrade head; then
            echo ""
            echo "ERROR: Database migrations failed."
            echo "  • Connection refused → PostgreSQL is not running. From project root:"
            echo "      docker compose -f docker/docker-compose.dev.yml up -d"
            echo "  • Copy backend/.env.example → backend/.env (defaults: postgres/postgres, db visioryx)"
            echo "  • Run ./scripts/preflight.sh to verify your machine"
            exit 1
        fi
        echo "Seeding admin user (if needed)..."
        "$PY" scripts/seed_admin.py || true
        echo "Verifying database tables..."
        if ! "$PY" "$PROJECT_ROOT/scripts/check_setup.py"; then
            exit 1
        fi
    )
}

start_backend() {
    echo "Starting backend on port 8000..."
    kill_port 8000
    # macOS: single-thread BLAS reduces SIGFPE crashes in OpenCV/numpy (see app/runtime_env.py)
    if [ "$(uname -s 2>/dev/null)" = "Darwin" ]; then
        export OPENBLAS_NUM_THREADS="${OPENBLAS_NUM_THREADS:-1}"
        export OMP_NUM_THREADS="${OMP_NUM_THREADS:-1}"
        export VECLIB_MAXIMUM_THREADS="${VECLIB_MAXIMUM_THREADS:-1}"
        export MKL_NUM_THREADS="${MKL_NUM_THREADS:-1}"
    fi
    cd "$PROJECT_ROOT/backend"
    if [ ! -d "venv" ]; then
        echo "Creating venv with $PYTHON_CMD..."
        "$PYTHON_CMD" -m venv venv || { echo "venv creation failed"; return 1; }
    elif [ ! -f "venv/bin/activate" ] && [ ! -f "venv/Scripts/activate" ]; then
        echo "Removing broken backend/venv (no activate script)..."
        rm -rf venv
        "$PYTHON_CMD" -m venv venv || { echo "venv creation failed"; return 1; }
    fi
    if [ -f "venv/bin/activate" ]; then
        # shellcheck source=/dev/null
        . venv/bin/activate
    elif [ -f "venv/Scripts/activate" ]; then
        # shellcheck source=/dev/null
        . venv/Scripts/activate
    else
        echo "venv activate not found, using $PYTHON_CMD for this session"
    fi
    pip install -q -r requirements.txt || pip3 install -q -r requirements.txt
    if ! setup_db; then
        echo "Backend start aborted (fix database setup above)."
        return 1
    fi
    # venv active → use its python; otherwise picked interpreter (matches where pip installed)
    if [ -n "${VIRTUAL_ENV:-}" ]; then
        python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
    else
        "$PYTHON_CMD" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
    fi
    echo "Backend started: http://localhost:8000"
}

start_frontend() {
    echo "Starting frontend on port 3000..."
    if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
        echo "ERROR: Node.js / npm not found. Install Node 20+ from https://nodejs.org"
        return 1
    fi
    kill_port 3000
    cd "$PROJECT_ROOT/frontend"
    if ! (npm install --silent 2>/dev/null || npm install); then
        echo "ERROR: npm install failed."
        return 1
    fi
    # After kill -9, .next can be half-written; webpack then throws Cannot find module './N.js' and 404 on /_next/static.
    # Default: clean build. Set VISIORYX_SKIP_NEXT_CLEAN=1 to keep .next for faster restarts (may re-hit stale chunks).
    if [ -n "${VISIORYX_SKIP_NEXT_CLEAN:-}" ]; then
        npm run dev &
    else
        echo "Clearing frontend/.next (avoids stale Webpack chunks)..."
        npm run dev:clean &
    fi
    echo "Frontend started: http://localhost:3000"
}

start_mobile() {
    echo "Starting mobile on port 8080..."
    kill_port 8080
    (cd "$PROJECT_ROOT/mobile" && export EXPO_NO_TYPESCRIPT_SETUP=1 && npx expo start --clear --port 8080) &
    echo "Mobile Metro bundler started: http://localhost:8080"
}

case "${1:-all}" in
    backend)
        start_backend || exit 1
        echo "Backend running. Press Ctrl+C to stop."
        wait
        ;;
    frontend)
        start_frontend || exit 1
        echo "Frontend running. Press Ctrl+C to stop."
        wait
        ;;
    mobile)
        start_mobile || exit 1
        echo "Mobile Metro bundler running. Press Ctrl+C to stop."
        wait
        ;;
    all)
        start_backend || exit 1
        sleep 2
        start_frontend || exit 1
        sleep 2
        start_mobile || exit 1
        echo ""
        echo "Visioryx running:"
        echo "  Dashboard: http://localhost:3000"
        echo "  API:       http://localhost:8000"
        echo "  Mobile:    http://localhost:8080"
        echo ""
        echo "Phone / QR on same Wi‑Fi: use your computer's LAN IP (e.g. http://192.168.x.x:3000), set"
        echo "  PUBLIC_DASHBOARD_URL or Admin → Email & SMTP → Public dashboard URL to that URL,"
        echo "  and leave NEXT_PUBLIC_API_URL unset in frontend so API uses the Next.js proxy."
        wait
        ;;
    *)
        echo "Usage: $0 [backend|frontend|mobile|all]"
        exit 1
        ;;
esac
