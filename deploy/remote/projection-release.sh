#!/usr/bin/env sh
set -eu

phase=${1:?Usage: projection-release.sh <stage|activate|refresh-lists|cleanup>}
deployment_directory=${DEPLOYMENT_DIRECTORY:?DEPLOYMENT_DIRECTORY is required}

case "$phase" in
  stage)
    exec sh "$deployment_directory/phases/stage.sh"
    ;;
  activate)
    exec sh "$deployment_directory/phases/activate.sh"
    ;;
  refresh-lists)
    for LIST_NAME in system board delegates; do
      export LIST_NAME
      sh "$deployment_directory/phases/refresh-lists.sh"
    done
    ;;
  cleanup)
    rm -f "/srv/wcarankings/.projection-compose-${ARTIFACT_ID}.yml"
    docker image rm "wcarankings-data-tools:artifact-${ARTIFACT_ID}" \
      "wcarankings-flyway:artifact-${ARTIFACT_ID}" || true
    rm -rf "$deployment_directory"
    ;;
  *)
    echo "Unknown projection release phase: $phase" >&2
    exit 2
    ;;
esac
