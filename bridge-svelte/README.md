## @nebulr-group/bridge-svelte

Bridge Svelte library. Add Bridge auth, feature flags, and payments to your SvelteKit 2 + Svelte 5 apps.

### Install

```bash
npm i @nebulr-group/bridge-svelte
```

### Usage

See the `demo/` app in the monorepo for end-to-end wiring.

### Build

```bash
npm run build
```

Artifacts are emitted to `dist/` via `svelte-package`.

### Release (branch-protected main)

```bash
# 1) Create release branch
git checkout -b release/v0.1.0-beta.1
git push -u origin release/v0.1.0-beta.1

# 2) Open a PR: release/v0.1.0-beta.1 -> main, approve and merge

# 3) After merge to main, tag and push
git checkout main && git pull
git tag v0.1.0-beta.1
git push origin v0.1.0-beta.1

# 4) Monitor GitHub Actions "Publish to npm"
```

### Commit signing (required)

Ensure your commits are verified before opening PRs:

```bash
# Option A: SSH signing (recommended)
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true

# Option B: GPG signing
gpg --full-generate-key
gpg --list-secret-keys --keyid-format=long
git config --global user.signingkey <KEY_ID>
git config --global commit.gpgsign true
```

### License

MIT © thebridgedev
