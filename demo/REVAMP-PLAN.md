# Demo Revamp — Implementation Plan

> The build plan for the docs-driven interactive demo. Reads alongside
> `DEMO-REVAMP.md` (UX/design spec) and `INTEGRATION.md` (architecture).
> Architecture in one line: `learning/*.md` is the single source of truth; the demo
> renders it (build-time) with live components + Inspector; the Astro hub renders it
> (sync action) as public docs.

## Workstreams

- **A — Content** (`/learning`): fill gaps, standardize shape. Feeds demo AND public docs.
- **B — Loader + template**: markdown→feature-page pipeline in the Svelte app.
- **C — Shell + Inspector**: app shell, persona switcher, docked live event inspector.
- **D — Page migration**: existing demo features onto the template.
- **E — New pages**: the gap features (branding, SSO, MFA, paywall, % rollout, tokens, tenancy).
- **F — E2E**: preserve + extend the Playwright contract.
- **G — Responsiveness**: engineering-owned (design artifact is desktop-only).
- **H — Snippet reconciliation**: removed by construction — code comes from `/learning`.

## A. `/learning` content gaps (also enriches public docs)

New topics to author:
1. **`multi-tenancy/`** — workspaces, tenant selection, `WorkspaceSelector` / `TenantSelector`,
   switching, data isolation. (First-class concept, no home today.)
2. **`mfa/`** (or a section in `sdk-auth`) — MFA challenge + enrollment (`MfaSetup`, backup codes).
3. **`sso/`** (or a section in `auth`) — federated login, `SsoButton`, connections, redirect/popup.
4. **Dynamic branding** — extend `theming/` (or new `branding/`) for *live* white-label via
   `bridge.app.branding` + `branding.updated` events, distinct from static CSS theming.
5. **Advanced feature flags** — extend `feature-flags/` with % rollout, sticky buckets,
   segments, operators.

Standardize across ALL topic files (additive, won't break sync):
6. **Frontmatter**: `title`, `order`, `oneLiner`, `related[]`.
7. **Section anchors**: `### Usage`, `### Config`, `### Props` (md table), `### Under the hood`.
8. **Per-sub-feature anchors in `auth.md`** so Login / Signup / Magic / Passkeys / OAuth
   demo pages each target their section.
9. Thicken `api-tokens.md` (scopes, one-time secret, revoke, server usage).

## B. Loader + feature-page template

- Build-time markdown loader: parse frontmatter + slice by H3 anchor; expose `oneLiner`,
  intro prose, `usage`/`config` code fences, `props` table, `underTheHood` per topic+section.
- Reusable `<FeaturePage>` that takes a `learning` slice + a live-panel snippet + props meta.
  Renders: header (oneLiner) · live panel ⟷ code tabs · props · under-the-hood · related.
- Syntax highlighting + copy for code; code text comes from `/learning` (authoritative).

## C. Shell + Inspector

- App shell: topbar (brand, search, env, persona switcher, theme, user), domain-grouped
  sidebar, content, docked Inspector. Light + dark per the design tokens.
- **Inspector wired to real SDK events** (`bridge.events`, `realtimeStatus`): live event
  stream, snapshots (token/profile/subscription/entitlements), API activity, connection.
- **Persona switcher** drives a real demo identity so RBAC / route guards / entitlement
  gates actually change behavior.

## D. Migrate existing features onto the template

Login, Signup, Magic link, Passkeys, OAuth, Feature Flags, Team panel, Workspaces,
Tenant selection, Subscription/Plans, Billing lifecycle, Quotas, Protected/route-guard.
Replace hard-coded copy/code with `/learning`-rendered content as sections land.
**Preserve all `data-testid`s and keep functional routes working** (see F).

## E. New gap pages (template + matching `/learning`)

Branding (live white-label) · SSO · MFA setup · `BridgePaywall` · % rollout · API tokens.
(Designer mockups exist for all; pair each with its new `/learning` content from A.)

## F. E2E (the validation harness, automated)

- Existing suite (auth, sdk-auth ×9, feature-flags, route-guard, subscription, team,
  bootstrap) MUST keep passing. Map the route+testid contract BEFORE moving anything.
- Strategy: keep functional testids on the real widgets; treat route renames as tracked
  changes; run all test edits through the **bridge-test-writer** sub-agent (platform rule).
- Add coverage for new pages where they exercise real plugin logic (e.g. API tokens,
  branding, % rollout) — the demo is how we validate plugin behavior.

## G. Responsiveness

Owned at build. Define breakpoints: where the live+code two-pane stacks, sidebar collapse,
Inspector → overlay/drawer on narrow widths. Not in the design artifact (inline-style/fixed
canvas), so it's net-new CSS work.

## Phasing & milestones

**Phase 0 — Prep (no app changes)**
- Map the E2E route+testid contract.
- Decide tenancy-doc home (recommend dedicated `multi-tenancy/`).
- Lock the `/learning` content convention (frontmatter + anchors) on ONE file as the template.

**Phase 1 — Prove the pull (vertical slice)**
- Loader + `<FeaturePage>`; convert `feature-flags.md` to the convention.
- Ship the Feature Flags page end-to-end: live `<FeatureFlag>` panel + rendered doc text/code.
- Acceptance: page content comes from `/learning`; no hard-coded snippet; FF E2E still green.

**Phase 2 — Shell + Inspector**
- App shell, sidebar, persona switcher, theme; Inspector on real events.
- Acceptance: persona switch changes a real gate; Inspector shows live events.

**Phase 3 — Migrate existing pages** (D) onto the template, section by section.
- Acceptance: full existing E2E suite green; copy/code sourced from `/learning`.

**Phase 4 — Content gaps + new pages** (A new topics + E)
- Author multi-tenancy, MFA, SSO, dynamic branding, advanced flags in `/learning`;
  build their pages. Confirm docs hub picks them up via sync.
- Acceptance: new pages live; new `/learning` topics appear in the Astro hub.

**Phase 5 — Responsiveness + polish + E2E extension** (G, F)
- Breakpoints; add E2E for new validating pages.

## Open decisions

1. **Tenancy doc home** — dedicated `multi-tenancy/` (recommended) vs fold into auth/team.
2. **MFA/SSO** — own topics vs sections under `sdk-auth`/`auth`. (Lean: sections, promote
   if they grow.)
3. **Branding** — extend `theming/` vs new `branding/`. (Lean: new `branding/`; theming is
   about CSS, branding is about live admin-pushed identity — different concepts.)
4. **Search (⌘K)** in the shell — Phase 2 scope or later? (Lean: later; non-trivial.)
