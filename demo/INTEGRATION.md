# Demo ⇄ Docs Integration Spec

> How the revamped demo, the doc source, and the public docs hub fit together.
> Companion to `DEMO-REVAMP.md` (the design brief). This doc is the **engineering
> architecture** we agreed on. Read `DEMO-REVAMP.md` for the visual/UX spec.

## 1. The model (agreed)

`bridge-svelte/learning/*.md` is the **single source of truth** for doc content.
**Two renderers** consume it, so they can never disagree:

```
                       SOURCE OF TRUTH  (authored once, in this plugin repo)
              ┌──────────────────────────────────────────────────────┐
              │   bridge-svelte/learning/*.md                          │
              │   auth · sdk-auth · feature-flags · payments · team ·   │
              │   api-tokens · theming · live-updates · configuration   │
              └──────────────────────────────────────────────────────┘
                      │                                       │
        build-time import                            sync-docs GitHub Action
        (SAME repo — no network)                     (.github/actions/sync-docs → GitLab)
                      │                                       │
                      ▼                                       ▼
      ┌────────────────────────────────┐      ┌─────────────────────────────────┐
      │  bridge-svelte/demo             │      │  thebridge-web/bridge-docs        │
      │  THE SVELTE APP                 │      │  Astro hub (public docs site)     │
      │  = reference implementation     │      │                                   │
      │                                 │      │  • renders MDX from synced/       │
      │  • real SDK components, live    │      │  • per-framework pages            │
      │    against the backend          │      │  • SEO / canonical reading        │
      │  • feature-page template:       │◄─────┤   same words, different renderer  │
      │      pulled doc text            │      └─────────────────────────────────┘
      │      + live panel + code        │
      │      + Inspector + persona      │
      │  • backs Playwright E2E         │
      └────────────────────────────────┘
                │                    │
                ▼                    ▼
        run & click it        read its source on GitLab
        (live demo)           (the reference implementation)
```

**One line:** `/learning/*.md` is written once; the **Svelte demo** (build-time import,
adds live components + Inspector + readable source) and the **Astro hub** (sync pipeline,
public prose) both render it.

### What this model is NOT
- Not "embed Svelte islands into the Astro docs site." The interactive experience **is**
  the standalone Svelte demo app. The docs hub keeps its own existing shell.
- No shell reconciliation. The design in `DEMO-REVAMP.md` is the **demo app's** shell.

## 2. Why this also fixes snippet accuracy

`/learning` already holds the **authoritative, maintained** code (e.g. `auth.md` shows the
real `bridgeBootstrap` + `routeConfig` wiring; `team-management.md` has a real props table).
When the demo renders code from `/learning` instead of hand-written strings, the earlier
snippet bugs (default-vs-named imports, invented `bridge.app.can`, etc.) disappear by
construction. **Rule: the demo never hard-codes a snippet that could live in `/learning`.**

## 3. Roles, unchanged

- **Demo app** = manual validation harness for plugin logic + reference implementation
  (readable on GitLab). Runs real SDK components against the live backend.
- **E2E (Playwright)** = automation of that same manual validation. Stays the demo's
  responsibility; the test contract (routes + testids) is preserved through the revamp.
- **Docs hub** = canonical public reading, all frameworks, SEO. Fed by the sync action.

## 4. Content-shape convention for `/learning`

Today `/learning` files are H1 + H3 sections with prose, fenced code, and (sometimes) a
props table. To serve both renderers cleanly we standardize lightly — **additive, doesn't
break the existing docs sync**:

- **Frontmatter** (new, optional → becomes required over time):
  ```yaml
  ---
  title: Authentication
  order: 20
  oneLiner: One <LoginForm> = password, MFA, magic link, passkeys, SSO, tenant select.
  related: [sdk-auth, team-management]
  ---
  ```
- **Standard H3 sections** the demo can target by anchor: prose intro, `### Usage`,
  `### Config`, `### Props` (markdown table), and optional `### Under the hood`
  (events / API calls — valuable in docs too, so it belongs here, not demo-only).
- **Granularity:** one topic file (e.g. `auth.md`) backs several demo pages (Login,
  Signup, Magic link, Passkeys, SSO, MFA, OAuth). The demo slices by **section anchor**;
  the docs hub renders the file whole. So keep sub-features as clearly-anchored H3 sections
  within the topic file rather than splitting into many files.

The demo's build-time loader maps: `oneLiner` → page subtitle · intro prose → header ·
`### Usage`/`### Config` fences → code panel tabs · `### Props` table → props section ·
`### Under the hood` → under-the-hood list. Demo-only concerns (live panels, persona
switching, the Inspector) stay in the demo and are **not** authored in `/learning`.

## 5. Designer pages → `/learning` topic mapping

| Demo page (design) | `/learning` source | Status |
|---|---|---|
| Getting Started · Overview | `README.md`, `examples/` | exists |
| Getting Started · Installation | `quickstart/hosted-quickstart.md` | exists |
| Getting Started · Provider & config | `configuration/configuration.md` | exists |
| Auth · Login / Signup / Magic / Passkeys / SSO / MFA / OAuth | `auth/auth.md` + `sdk-auth/sdk-quickstart.md` | exists — needs **section anchors per sub-feature** |
| Tenancy · Workspace selector / Tenant selection | — | ⚠ **GAP — no dedicated topic.** Add `multi-tenancy/` (or a section in auth/team) |
| Team & RBAC · Team panel / Profile / Workspace form | `team-management/team-management.md` | exists (already has props table) |
| Feature Flags · Patterns / % rollout | `feature-flags/feature-flags.md` | exists |
| Billing · Plans / Lifecycle / Quotas / Paywall | `payments/payments.md` | exists — confirm covers quotas/entitlements/paywall |
| Realtime · Inspector / Cross-tab sync | `live-updates/live-updates.md` | exists |
| Branding · Live white-label | `theming/theming.md` | exists |
| Developer · API tokens | `api-tokens/api-tokens.md` | exists |

**Gaps to fill in `/learning` (which also enriches the public docs):**
1. **Multi-tenancy / workspaces** — no topic today; the demo has Workspace + Tenant pages.
2. **Per-sub-feature anchors in `auth.md`** so each auth demo page can target its section.
3. **`### Under the hood`** sections where we want the event/API teaching (flags, billing,
   realtime especially).
4. Confirm **payments.md** covers quotas, entitlements, and the paywall.

## 6. Build phasing

1. **Loader + one page.** Build the `/learning` markdown loader (frontmatter + section
   anchors) and wire the design's feature-page template to it for ONE page (Feature Flags
   is a good first — rich content, clear live panel). Prove the pull end-to-end.
2. **Shell + Inspector.** Stand up the app shell (sidebar/topbar/persona) and the docked
   Inspector against real SDK events.
3. **Migrate pages** onto the template, pulling from `/learning`. Replace hard-coded
   snippets with rendered ones as their sections land.
4. **Fill `/learning` gaps** (§5) — these sync to the docs hub automatically.
5. **Responsiveness** — owned at build (the design artifact is desktop-only by tooling).
6. **E2E reconciliation** — preserve testids; update routes via the bridge-test-writer
   sub-agent per platform rules.

## 7. Open decision

- **Tenancy doc gap (§5.1):** new `/learning/multi-tenancy/` topic, or fold workspace/tenant
  into `auth.md` / `team-management.md`? (Recommend a dedicated topic — it's a first-class
  Bridge concept and deserves its own docs page.)
