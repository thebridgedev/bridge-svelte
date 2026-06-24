# Bridge Svelte Demo — Revamp Brief

> **Purpose of this document.** It is the single source of truth for leveling up the
> bridge-svelte demo app. It is written to be **handed to a designer (human or agent)**
> with no other context required. Read top to bottom: product context → current state →
> goals → the demo we're building → the demo we're only brainstorming → constraints →
> what we need from design.

---

## 0. TL;DR for the designer

We have a working demo app that showcases a developer SDK ("the Bridge"). Today it's a
flat, functional "feature museum" — a nav bar with one page per feature, built primarily
to back automated tests. We want a **big makeover** into **living, runnable documentation**
for developers integrating the SDK: every feature shown via a uniform page that pairs a
**live working component** with **copy-paste code** and an **"under the hood" inspector**.

We're building **one** demo (developer-focused, in this repo). We're **also brainstorming**
a second, separate **founder/prospect** demo (cinematic, story-driven) — design thinking
welcome, but it is *not* being implemented yet.

Your job: define the **visual design system, layout shell, and the reusable feature-page
template** that the whole developer demo is built from.

---

## 1. Product context — what is "the Bridge"?

The Bridge (a.k.a. nblocks / Nebulr) is a **B2B SaaS backend-as-a-platform**. It gives a
developer the "boring but essential" parts of a multi-tenant SaaS out of the box, consumed
through framework SDKs. `@nebulr-group/bridge-svelte` is the Svelte/SvelteKit SDK; it wraps
a framework-agnostic core (`@nebulr-group/bridge-auth-core`).

What the Bridge provides (the capability surface the demo exists to show):

- **Authentication** — password login, signup, magic link (passwordless), passkeys/WebAuthn,
  SSO/federated (Google/Microsoft/enterprise), MFA, password reset, OAuth hosted flow.
- **Multi-tenancy** — one app, many customer workspaces; switch workspace, isolated data.
- **Team & RBAC** — invite members, assign roles, manage permissions, edit profile/workspace.
- **Feature flags** — simple toggles, rule-based targeting, client context, % rollouts,
  segments — all updatable live from an admin UI with no redeploy.
- **Subscriptions & billing** — plan selection, Stripe checkout, billing lifecycle
  (trial → dunning → locked), quotas, usage metering, entitlements.
- **Realtime** — a WebSocket channel that pushes flag/plan/role/branding changes to the app
  live (no refresh), and syncs across browser tabs.
- **Branding / white-label** — tenant logo, colors, fonts pushed from admin to the app.
- **Developer surface** — scoped API tokens, plus a backend Management SDK.

**The emotional core of the product:** "Everything a SaaS needs that isn't your product —
already built. You write a few lines; the Bridge does the rest." The demo must *make a
developer feel that* by showing how little code each capability takes.

---

## 2. The demo app today (current state)

### 2.1 Tech stack
- **SvelteKit 2 + Svelte 5 (runes)**, Vite 6, TypeScript.
- **Styling: hand-written custom CSS** in `src/app.css` + per-component `<style>` blocks.
  No Tailwind, no UI component library. (We want to keep it framework-free CSS — the demo
  should look like "what you'd actually ship," not a template.)
- Demo runs on port 3001 locally (Docker maps to 3008).
- The demo **doubles as the Playwright E2E target** — see §6.3.

### 2.2 Current routes (the "museum")
Flat nav, one page per feature:

| Route | Shows |
|---|---|
| `/` | Landing: hero + 6-card feature-overview grid |
| `/auth/login` `/auth/signup` `/auth/forgot-password` `/auth/magic-link` | SDK auth forms |
| `/auth/set-password/[token]` `/auth/setup-passkey/[token]` `/auth/oauth-callback` | auth continuations |
| `/welcome` | first-run plan picker |
| `/flag-demo` | 3 feature-flag patterns (on/off, rule-based, client context) |
| `/discovery-probe` `/attr-probe` | flag test harnesses (testid-driven) |
| `/beta` | flag-gated route (route guard demo) |
| `/protected` | auth-gated page showing profile |
| `/team-panel` | native `TeamManagementPanel` |
| `/workspaces` | `WorkspaceSelector` (default + custom row) |
| `/subscription` | `PlanSelector` + usage/quota/entitlements probes |
| `/subscription/success` `/subscription/cancel` `/subscription-relative` `/payment-error` | billing callbacks |
| `/billing-lifecycle` | Billing 2.0 state simulator + a **DEBUG-only realtime event console** |

### 2.3 Current design language (starting point — extend, don't discard)
From `src/app.css`:
- **Font:** Inter (Google Fonts) + system fallback.
- **Palette (CSS custom properties):**
  - Slate: `#f8fafc` `#e2e8f0` `#94a3b8` `#475569` `#0f172a`
  - Green (success): `#f0fdf4` `#86efac` `#4caf50` `#166534`
  - Red (error): `#ef4444` `#dc2626`
  - Orange (warning): `#ff9800` `#f57c00` `#e65100`
  - Blue (primary): `#2563eb`
- **Spacing scale:** `0.5 / 0.75 / 1 / 1.5 / 2 rem` (xs→xl).
- **Radius:** `0.375 / 0.5 / 0.75 rem`. **Shadows:** sm / md / hover.
- **Type:** heading-xl 2.25rem, heading-lg 1.5rem, heading-md 1.125rem, lead 1.125rem.
- **Components in use:** cards (white, bordered, soft shadow, hover-lift), responsive
  auto-fit grids, primary/ghost buttons, status chips, dark code blocks.
- Background `#f8fafc`, body text `#0f172a`.

**Assessment:** clean and competent but generic and flat. It reads as "starter template,"
not "polished product documentation." No real app shell, no information hierarchy beyond a
top nav, no dark mode, no persistent context.

### 2.4 What's wrong with it (the brief in one paragraph)
It's built for *tests and SDK authors*, not *learners*. Pages expose raw internals
("probes," `useBridge().subscription.hydrate()`) and assume you already know what each
feature is. There's no narrative, no "why," and no consistent way to learn a feature →
see it work → copy the code. The most valuable teaching asset — a live realtime event
log — is hidden in a DEBUG-only corner overlay.

---

## 3. Goals & audiences (two tracks)

| | **Track A — Developer demo** | **Track B — Founder demo** |
|---|---|---|
| **Status** | **BUILD NOW** (this repo) | **BRAINSTORM ONLY** (separate, later) |
| **Audience** | Developers evaluating / integrating the SDK | Founders / buyers in a live sales demo |
| **Job** | "Show me it works and give me the code" | "Make me feel what I don't have to build" |
| **Tone** | Living documentation, precise, dense-but-clean | Cinematic, narrative, emotional |
| **Code shown?** | Yes — front and center | No — hidden behind the experience |
| **Where it lives** | Replaces/restructures current routes | New namespace later (e.g. `/tour/*`) |

Both tracks reuse the **same underlying SDK components** — Track A documents them, Track B
dresses them in a story. Build A first; A's parts feed B.

---

## 4. TRACK A — Developer demo (the thing we design & build)

### 4.1 North star
Turn the demo into **living, runnable documentation**. For any capability a developer gets,
on one screen: **what it solves → it working live → the exact code → what fired under the hood.**

### 4.2 The app shell (global layout)
A persistent docs-style shell, three regions:

```
┌──────────────────────────────────────────────────────────────────────┐
│ TOPBAR:  Bridge Demo logo │ search │ env: local │ [persona ▾] │ [auth] │
├───────────────┬────────────────────────────────────┬─────────────────┤
│ SIDEBAR (nav) │ CONTENT (the feature page)         │ INSPECTOR        │
│               │                                    │ "Under the Hood" │
│ Getting Start │  ┌──────────────────────────────┐  │                 │
│ Auth          │  │  Feature title + 1-liner     │  │ • live events    │
│  Login        │  ├───────────────┬──────────────┤  │ • token/profile  │
│  Signup       │  │  LIVE          │  CODE         │  │   snapshot       │
│  Magic link   │  │  (component)   │  (copyable)   │  │ • API calls      │
│  Passkeys     │  │                │               │  │ • realtime status│
│  SSO     ⬅new │  ├───────────────┴──────────────┤  │                 │
│  MFA setup⬅new│  │  PROPS / OPTIONS table        │  │ [dockable /      │
│ Tenancy       │  ├──────────────────────────────┤  │  collapsible]    │
│ Team & RBAC   │  │  UNDER THE HOOD (this feature)│  │                 │
│ Feature Flags │  └──────────────────────────────┘  │                 │
│ Billing       │                                    │                 │
│ Realtime      │                                    │                 │
│ Branding ⬅new │                                    │                 │
│ Developer⬅new │                                    │                 │
└───────────────┴────────────────────────────────────┴─────────────────┘
```

- **Topbar:** brand, (optional) search, environment indicator, **persona switcher** (§4.5),
  auth state / login-logout.
- **Sidebar:** grouped by domain (see §4.4), collapsible groups, active-state, deep-linkable.
- **Inspector:** the promoted realtime console (§4.6) — dockable right rail, collapsible to
  a tab/FAB. This is a signature element; design it as a first-class panel, not a debug toy.

### 4.3 The feature-page template (the most important deliverable)
Every feature page is the **same anatomy** so learning one teaches all:

1. **Header** — feature name + a single plain-language sentence: *what problem it solves.*
   ("One `<LoginForm>` = password, MFA, magic link, passkey, SSO, and tenant selection.")
2. **Live panel** — the real, interactive SDK component, working against the live backend.
3. **Code panel** — tabbed: **Usage** (minimal) / **Config** / **Props**. Copy button.
   Syntax-highlighted. Must visually pair with the live panel (side-by-side on desktop,
   stacked on mobile).
4. **Props / options reference** — a clean table of the component's props/snippets.
5. **Under the hood (scoped to this feature)** — which SDK calls run, which events fire,
   which stores update when you interact above.
6. **Related** — links to adjacent features.

Design the template once; it must gracefully handle features that are mostly visual (a form)
and features that are mostly conceptual (route guards, realtime).

### 4.4 Information architecture (sidebar groups)
- **Getting Started** — install, `BridgeBootstrap`/provider, the unified `bridge` surface, config.
- **Auth** — Login · Signup · Magic link · Passkeys · **SSO** ⬅new · **MFA setup** ⬅new · OAuth redirect.
- **Tenancy** — Workspace selector · Tenant selection.
- **Team & RBAC** — Team panel · Profile form · Workspace form.
- **Feature Flags** — Simple → Rule-based → Client context → **% rollout & targeting** ⬅new.
- **Billing** — Plans · Lifecycle · Quotas & entitlements · **Paywall** ⬅new.
- **Realtime** — Inspector as a headline · cross-tab sync demo.
- **Branding** ⬅new — live white-label.
- **Developer** ⬅new — API tokens · pointer to backend Management SDK.

### 4.5 Persona / state switcher (top bar)
A control to switch the viewer's simulated identity — e.g. **Admin / Member / Billing-owner**,
logged-in/out, plan tier. Switching it changes what RBAC, route guards, and entitlement
gates allow, so the viewer *feels* access control by clicking rather than reading. Design
this as a prominent, legible control (it's a core teaching device).

### 4.6 The "Under the Hood" inspector (signature element)
Promote today's hidden DEBUG realtime event log into an always-available docked panel:
- **Live event stream** — every SDK event (auth, flags, subscription, quota, realtime) as it
  fires, with type, timestamp, payload peek.
- **Current snapshots** — token / profile / subscription / entitlements at a glance.
- **API activity** — endpoints just hit.
- **Connection status** — realtime socket state (open/closed/reconnecting).
- Collapsible to a tab or FAB; expandable to a focused view. Needs a distinct but harmonious
  visual treatment (think "devtools panel that belongs to this design system").

### 4.7 Features to ADD during the makeover (currently invisible, exist in the SDK)
Each slots into the standard template:
- **Branding / white-label** (live logo/color/font swap) — highest-impact gap.
- **SSO buttons** (Google/Microsoft/enterprise federated login).
- **API token management** (create/revoke scoped tokens).
- **MFA enrollment** (QR + backup codes — today only the login-time challenge shows).
- **`BridgePaywall`** (full-screen hard plan gate).
- **Advanced feature flags** (% rollout, segments, operators).

### 4.8 Design language direction (what we want from you)
Keep custom, framework-free CSS, but elevate to **docs-grade product polish**:
- A real app shell (sidebar + content + inspector), strong hierarchy, generous but dense.
- **Light + dark mode** (developers expect dark; the inspector especially benefits).
- First-class **code blocks** (syntax highlighting, copy, tabbed) — they're primary content here.
- A refined type scale, spacing rhythm, and component set (cards, tables, chips, tabs,
  buttons, badges, the inspector, the persona switcher, sidebar nav).
- Evolve the existing slate/blue/green/orange/red tokens into a fuller, themeable palette
  (semantic tokens: surface, border, text-muted, primary, success, warn, danger, plus a
  dedicated accent for "live/realtime").
- It should feel like a polished developer product (think Stripe/Clerk/Linear-tier docs &
  dashboards) while still reading as "real shippable Svelte CSS."

---

## 5. TRACK B — Founder demo (brainstorm only, keep separate)

Not being built yet — but design thinking captured so it isn't lost.

- **Framing:** "You're launching Acme. Let's stand up a real SaaS in front of you." Full-screen,
  cinematic, guided Next/Back. No sidebar, no code by default.
- **Arc mirrors a founder's journey:** users sign in → invite the team → control who sees
  what → ship a feature to 10% → charge money → enforce the plan → it all stays in sync →
  it's *your* brand.
- **Showstopper:** split-screen **App ⇆ Admin**. Flip a flag / change a plan / swap the logo
  in admin → watch the app react live, no refresh. Single most persuasive moment.
- **Value counters, not code:** running tally — "things you'd normally build: 47 · lines you
  wrote: ~30."
- **Lives separately** (e.g. `/tour/*` or a later standalone build), reusing the same SDK
  components Track A documents.

---

## 6. Constraints & non-negotiables

### 6.1 Tech
- SvelteKit 2 + **Svelte 5 runes**; custom CSS only (no Tailwind / UI lib).
- The demo must stay a **real running app against the live backend** — components are real,
  not mocked screenshots.

### 6.2 "What you'd actually ship"
The styling should look like production-grade Svelte a developer could lift — not a design
that requires tooling the SDK doesn't ship with.

### 6.3 E2E test contract (critical for engineering, FYI for design)
The demo backs the Playwright E2E suite (auth, bootstrap, feature-flags, route-guard,
team-management), pinned to current **routes and `data-testid`s**. The makeover will move
routes and DOM, so engineering will: keep functional testids on the real widgets, treat
route renames as tracked changes, and reconcile tests via the project's test-writer agent.
**Design implication:** the live components keep their behavior/identifiers; you're
restyling and re-housing them, not replacing their function.

### 6.4 Accessibility
Keyboard nav, focus states, contrast (esp. dark mode + code blocks), reduced-motion respect.

---

## 7. What we need from the designer

**Primary deliverables (Track A):**
1. **Visual design system** — color tokens (light + dark, semantic), type scale, spacing,
   radius, shadow, elevation; component specs (buttons, cards, tabs, tables, chips/badges,
   code block, sidebar nav item, inspector, persona switcher).
2. **App shell layout** — topbar + sidebar + content + inspector, responsive behavior
   (desktop / tablet / mobile), collapse/dock states.
3. **The feature-page template** — the §4.3 anatomy as a reusable, pixel-specified layout,
   shown for at least: a form-heavy feature (Login), a conceptual feature (Realtime/route
   guard), and a data feature (Billing lifecycle).
4. **The inspector panel** design (§4.6).
5. **Landing / "Getting Started"** page redesign (replaces today's 6-card grid).

**Secondary (Track B, exploratory):** mood / concept frames for the cinematic founder tour,
especially the split-screen App⇆Admin showstopper.

**Open questions for design to weigh in on:**
- Dark-first, light-first, or true dual with toggle?
- Inspector: right rail vs bottom dock vs both?
- How prominent should "lines of code" / value framing be in the *developer* demo (vs saving
  it for the founder demo)?
- Brand alignment: should the demo adopt Bridge/nblocks brand identity, or stay neutral
  "developer docs" so it reads as a reference implementation?

---

## 8. Appendix — full SDK capability surface (for completeness)

So design knows the breadth that may eventually need a home:

- **Auth components:** `LoginForm`, `SignupForm`, `MfaChallenge`, `MfaSetup`, `TenantSelector`,
  `WorkspaceSelector`, `SsoButton`, `ForgotPassword`, `MagicLink`, `PasskeyLogin`,
  `PasskeySetup`, `PasskeyRequestSetupLink`.
- **Profile/Team:** `ProfileName`, `TeamManagementPanel`, `TeamUserList`, `TeamProfileForm`,
  `TeamWorkspaceForm`.
- **Billing:** `PlanSelector`, `BridgeSubscriptionStatus`, `BridgeBillingNotice`,
  `BridgePaywall`, `BridgeQuotaBanner`.
- **Flags:** `FeatureFlag`, `useFlag`, `flagStore`, plus a full rule engine (operators,
  buckets/% rollout, segments).
- **Developer:** `ApiTokenManagement`; backend `BridgeManagement` SDK (tenants, users, roles,
  flags, plans, branding).
- **Stores / surface:** `isAuthenticated`, `profileStore`, `subscriptionStore`, `authState`,
  `realtimeStatus`, and a unified `bridge.*` surface (`bridge.app.branding`, `bridge.tenant`,
  `bridge.user`, `bridge.attributes`, `bridge.events`).
- **Cross-cutting:** route guards (path + flag requirements), realtime session snapshots,
  cross-tab sync, token auto-refresh, JWKS verification.
