#!/bin/bash
# Installs workspace dependencies so tests, typecheck and E2E work in Claude Code on the web.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
# Playwright browsers are preinstalled in the web container; never download them.
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
pnpm install --prefer-offline
