#!/usr/bin/env bash
set -euo pipefail
: "${SIRO_TEST_POSTGRES_CONTAINER:?isolated test container required}"
args=(); file=''
while (($#)); do
  if [[ "$1" == '--file' ]]; then file="$2"; shift 2; else args+=("$1"); shift; fi
done
[[ "$file" == .cache/restore-drill-*/fixture.dump ]]
remote="/tmp/siro-fixture-${GITHUB_RUN_ID:?}-${GITHUB_JOB:?}.dump"
trap 'docker exec "$SIRO_TEST_POSTGRES_CONTAINER" rm -f "$remote" >/dev/null' EXIT
docker exec -e PGPASSWORD "$SIRO_TEST_POSTGRES_CONTAINER" pg_dump "${args[@]}" --file "$remote"
docker cp "$SIRO_TEST_POSTGRES_CONTAINER:$remote" "$file" >/dev/null
