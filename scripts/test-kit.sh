#!/usr/bin/env bash
# Runs the plugin's type check, unit tests and the demo's build on SvelteKit 2 or 3, in a copy of the repo.
#
#   scripts/test-kit.sh 3        SvelteKit 3 with Vite 8 and @sveltejs/vite-plugin-svelte 7
#   scripts/test-kit.sh 2        SvelteKit 2 (the repo's own versions)
#
# BRIDGE_AUTH_CORE=file:/path/to/auth-core.tgz tests against an auth-core that is not published yet.
set -euo pipefail

KIT="${1:?usage: scripts/test-kit.sh <2|3>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

tar --exclude=node_modules --exclude=.svelte-kit --exclude=dist --exclude=test-reports --exclude=.git -cf - -C "$ROOT" . | tar -xf - -C "$WORK"
cd "$WORK"

KIT="$KIT" bun -e '
  const fs = require("node:fs");
  const core = process.env.BRIDGE_AUTH_CORE;
  for (const file of ["package.json", "bridge-svelte/package.json", "demo/package.json"]) {
    const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    const dev = pkg.devDependencies ?? {};
    if (process.env.KIT === "3") {
      if (dev["@sveltejs/kit"]) dev["@sveltejs/kit"] = "^3.0.0";
      if (dev["vite"]) dev["vite"] = "^8.0.12";
      if (dev["@sveltejs/vite-plugin-svelte"]) dev["@sveltejs/vite-plugin-svelte"] = "^7.0.0";
      if (dev["svelte"]) dev["svelte"] = "^5.57.1";
      if (dev["typescript"]) dev["typescript"] = "^6.0.0";
    }
    if (core && pkg.dependencies?.["@nebulr-group/bridge-auth-core"]) pkg.dependencies["@nebulr-group/bridge-auth-core"] = core;
    fs.writeFileSync(file, JSON.stringify(pkg, null, "\t") + "\n");
  }
'

echo "==> SvelteKit $KIT: install"
bun install
echo "==> SvelteKit $KIT: type check"
bun run check
echo "==> SvelteKit $KIT: unit tests"
bun run test:unit
echo "==> SvelteKit $KIT: package the plugin and build the demo"
bun run build:bridge
bun run build
echo "==> SvelteKit $KIT: OK"
