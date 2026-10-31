#!/usr/bin/env bash
set -euo pipefail
: "${SIRO_TEST_POSTGRES_CONTAINER:?isolated test container required}"
args=("$@"); last=$((${#args[@]}-1)); file="${args[$last]}"; unset 'args[last]'
[[ "$file" == .cache/restore-drill-*/fixture.dump ]]
remote="/tmp/siro-restore-${GITHUB_RUN_ID:?}-${GITHUB_JOB:?}.dump"
trap 'docker exec "$SIRO_TEST_POSTGRES_CONTAINER" rm -f "$remote" >/dev/null' EXIT
docker cp "$file" "$SIRO_TEST_POSTGRES_CONTAINER:$remote" >/dev/null
docker exec -e PGPASSWORD "$SIRO_TEST_POSTGRES_CONTAINER" pg_restore "${args[@]}" "$remote"
