# /publish-local — Publish packages to local Verdaccio registry

Builds and publishes one or both local packages to the Verdaccio registry running at http://localhost:4873.

## Argument
`$ARGUMENTS` can be:
- (empty) or `all` → publish both auth-core and bridge-svelte
- `auth-core`      → publish only @nebulr-group/bridge-auth-core
- `bridge-svelte`  → publish only @nebulr-group/bridge-svelte

## Steps

1. **Check Verdaccio is running.**
   Run: `curl -sf http://localhost:4873/-/ping` (or open the URL).
   If it fails, tell the user to start it: `cd thebridge-platform/verdaccio && docker compose up -d`

2. **Publish based on argument.**

   For `auth-core` only:
   - `cd ../auth-core && bun run publish:local`

   For `bridge-svelte` only:
   - `bun run publish:local:plugin`

   For `all` (default):
   - `bun run publish:local` (publishes core then plugin in order)

   Run these commands from the `bridge-svelte` workspace root.

3. **Verify publication.**
   After publishing, confirm each package appears at:
   - http://localhost:4873/-/web/detail/@nebulr-group/bridge-auth-core
   - http://localhost:4873/-/web/detail/@nebulr-group/bridge-svelte

4. **Report results.**
   Show the published version(s) and confirm consuming projects can now run `bun install`.
