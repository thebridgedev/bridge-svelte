#!/usr/bin/env bash
# Runs the demo's Playwright suite against a real Bridge server (stage), in a container.
#
#   docker run --rm -v "$PWD:/app" -v "$HOME/.aws:/root/.aws:ro" \
#     -e E2E_PARITY_MANIFEST=/app/.stage/manifest.json -e E2E_SECRET_ID -e E2E_SECRET_REGION -e AWS_REGION \
#     mcr.microsoft.com/playwright:v1.60.0-noble bash /app/scripts/stage-e2e.sh [embedded|hosted|both] [playwright args]
#
# The manifest comes from the parity fixture. Nothing is printed that holds a secret.
set -euo pipefail
cd /app
mode="${1:-both}"
shift || true
command -v bun >/dev/null || npm i -g bun >/dev/null 2>&1
[ -d node_modules/.bin ] && [ -f node_modules/.linux-installed ] || { bun install >/dev/null && touch node_modules/.linux-installed; }
bun run build:bridge >/dev/null
npx --yes playwright@1.61.1 install chromium >/dev/null
bun e2e/stage/prepare.ts
status=0
if [ "$mode" = "embedded" ] || [ "$mode" = "both" ]; then E2E_STAGE_MODE=embedded bunx playwright test -c playwright.stage.config.ts "$@" || status=$?; fi
if [ "$mode" = "hosted" ] || [ "$mode" = "both" ]; then E2E_STAGE_MODE=hosted bunx playwright test -c playwright.stage.config.ts "$@" || status=$?; fi
exit $status
