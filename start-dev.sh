#!/usr/bin/env bash
# Convenience wrapper — run from repo root: ./start-dev.sh [backend|frontend|all]
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/scripts/start-dev.sh" "$@"
