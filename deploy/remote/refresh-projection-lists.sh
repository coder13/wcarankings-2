#!/usr/bin/env sh
set -eu

cd /srv/wcarankings
compose_base="/srv/wcarankings/.projection-compose-${ARTIFACT_ID}.yml"
override=$(mktemp)
trap 'rm -f "$override"' EXIT
printf 'services:\n  data-tools:\n    image: wcarankings-data-tools:artifact-%s\n' \
  "$ARTIFACT_ID" > "$override"

case "$LIST_NAME" in
  system) command="/app/scripts/refresh-system-lists.ts" ;;
  board) command="/app/scripts/refresh-board-list.ts" ;;
  delegates) command="/app/scripts/refresh-board-list.ts --delegates" ;;
  *)
    echo "Unknown list refresh: $LIST_NAME" >&2
    exit 1
    ;;
esac

# shellcheck disable=SC2086
docker compose -f "$compose_base" -f "$override" run --rm data-tools $command
