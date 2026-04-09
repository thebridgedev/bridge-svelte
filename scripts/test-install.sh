#!/usr/bin/env bash
# Test that the packed package installs cleanly with Svelte 5 + SvelteKit 2.
# Run from repo root: bun run test:install (or ./scripts/test-install.sh)
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Building and packing package..."
bun install
bun run build:bridge
bun run package
# package script outputs to repo root (destination ../ from bridge-svelte)
PACKED=$(ls "$ROOT"/nebulr-group-bridge-svelte-*.tgz 2>/dev/null | head -1)
if [ -z "$PACKED" ] || [ ! -f "$PACKED" ]; then
  echo "Could not find packed tarball" >&2
  exit 1
fi
mv "$PACKED" "$ROOT/install-test-pkg.tgz"

TEST_DIR="$ROOT/install-test-tmp"
TGZ="$ROOT/install-test-pkg.tgz"
rm -rf "$TEST_DIR"
trap "rm -rf '$TEST_DIR'; rm -f '$TGZ'" EXIT

echo "==> Testing install with svelte@5 + @sveltejs/kit@2..."
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"
npm init -y
npm install svelte@^5 @sveltejs/kit@^2
npm install "$ROOT/install-test-pkg.tgz"
echo "    svelte@5 + @sveltejs/kit@2: OK"
rm -rf "$TEST_DIR"
rm -f "$TGZ"

echo "==> All install tests passed."
