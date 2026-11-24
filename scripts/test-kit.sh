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
# KIT_WORKDIR keeps the copy there (to run more in it); KIT_PREPARE_ONLY stops after the install.
WORK="${KIT_WORKDIR:-$(mktemp -d)}"
if [ -z "${KIT_WORKDIR:-}" ]; then trap 'rm -rf "$WORK"' EXIT; else mkdir -p "$WORK"; fi

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
      if (dev["@sveltejs/package"]) dev["@sveltejs/package"] = "^3.0.0";
      if (dev["@sveltejs/adapter-auto"]) dev["@sveltejs/adapter-auto"] = "^9.0.0";
    }
    if (core && pkg.dependencies?.["@nebulr-group/bridge-auth-core"]) pkg.dependencies["@nebulr-group/bridge-auth-core"] = core;
    fs.writeFileSync(file, JSON.stringify(pkg, null, "\t") + "\n");
  }
'

if [ "$KIT" = "3" ]; then
  # SvelteKit 3 no longer reads svelte.config.js: its settings go to the sveltekit() plugin in the Vite config.
  rm -f bridge-svelte/svelte.config.js demo/svelte.config.js
  # ...and its TypeScript settings come from `$app/tsconfig`.
  sed -i.bak 's|"extends": "./.svelte-kit/tsconfig.json"|"extends": "$app/tsconfig"|' bridge-svelte/tsconfig.json demo/tsconfig.json
  rm -f bridge-svelte/tsconfig.json.bak demo/tsconfig.json.bak
  cat > bridge-svelte/vite.config.ts <<'CONFIG'
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit({ preprocess: vitePreprocess() })]
});
CONFIG
  cat > demo/vite.config.ts <<'CONFIG'
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			preprocess: vitePreprocess(),
			adapter: adapter(),
			alias: {
				$lib: 'src/lib',
				'@nebulr-group/bridge-svelte/styles': '../bridge-svelte/src/lib/styles.css',
				'@nebulr-group/bridge-svelte/server': '../bridge-svelte/src/lib/server/index.ts',
				'@nebulr-group/bridge-svelte': '../bridge-svelte/src/lib'
			}
		})
	],
	resolve: { dedupe: ['@sveltejs/kit', 'svelte', '@nebulr-group/bridge-auth-core'] },
	server: { host: '0.0.0.0', port: 3001, strictPort: true, fs: { allow: ['..'] } },
	preview: { host: '0.0.0.0', port: 3001, strictPort: true }
});
CONFIG
fi

echo "==> SvelteKit $KIT: install"
bun install
if [ -n "${KIT_PREPARE_ONLY:-}" ]; then exit 0; fi
echo "==> SvelteKit $KIT: type check"
bun run --filter @nebulr-group/bridge-svelte check
# The demo app is written the SvelteKit 2 way (`$env`, `Handle`, svelte.config.js); on 3 it is built and run, not type-checked.
if [ "$KIT" = "2" ]; then bun run --filter demo check; fi
echo "==> SvelteKit $KIT: unit tests"
bun run test:unit
echo "==> SvelteKit $KIT: package the plugin and build the demo"
bun run build:bridge
bun run build
echo "==> SvelteKit $KIT: OK"
