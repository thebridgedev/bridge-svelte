# Bridge SvelteKit — The Look (bridge-svelte 1.0)

You are making Bridge's pages and components look like part of a SvelteKit app that uses `@nebulr-group/bridge-svelte` 1.0: the sign-in pages (`<BridgeAuthRoutes>`), the plan pages (`<BridgeBillingRoutes>`), the team panel (`<TeamPanel>`) and every dialog and notice. The app's own fonts, colours, spacing and corners, without restyling Bridge by hand. If Bridge is not set up in the project yet, do `bridge guide svelte` (MCP: `get_integration_guide topic=integration framework=svelte`) first.

## How the look works

- Bridge's pages render **inside the app's `+layout.svelte`**, so they already take its navigation, font, text size, text colour and background.
- `import '@nebulr-group/bridge-svelte/styles'` (in the root layout) gives Bridge's components their structure and a default look. Keep it.
- Every Bridge style sits in a CSS cascade layer named **`bridge`**, so **the app's CSS wins** over it, whatever the specificity and whatever the load order, with no `!important`. The one exception is CSS the app put in a layer of its own declared before `bridge`.
- The supported way to restyle is the **`--bridge-*` tokens** below, set in the app's own stylesheet. They are kept stable across releases.

This is separate from the hosted page's branding in the Bridge dashboard (`bridge branding get`, MCP `get_branding`), which styles Bridge's own hosted page and emails, not the app's pages.

## Decide first

- **The developer asked for Bridge's default look**: leave the tokens alone, and say so in one line.
- **The app has no styling of its own** (a fresh template, the browser's default styles): Bridge's defaults are used; say so in one line. Bridge gives itself a system font when the page's body is still in the browser's default serif.
- **Otherwise**: read the app's styling and set the tokens, as below. This is not optional; leaving Bridge's indigo defaults in an app with a look of its own is the mistake this guide exists to prevent.

## Step 1: read the app's styling

Find what the app already uses, in this order, and write down the values:

1. **CSS custom properties** on `:root` / `html` / `body` / `[data-theme]` in the global stylesheet (`src/app.css`, `src/app.postcss`, `src/styles/*`, anything `+layout.svelte` imports): primary or brand colour, background, foreground, muted text, border, radius, font family, shadows.
2. **Tailwind**: v4 `@theme { … }` blocks in the CSS (`--color-*`, `--radius-*`, `--font-*`, `--shadow-*`); v3 `tailwind.config.{js,ts}` `theme` / `theme.extend` (`colors`, `borderRadius`, `fontFamily`, `boxShadow`). Then look at what the app's own buttons and inputs actually use (`bg-teal-700 rounded-lg px-4 py-2`): the classes on a real button beat the config.
3. **A component library's tokens**: shadcn-svelte / bits-ui (`--primary`, `--primary-foreground`, `--background`, `--foreground`, `--muted-foreground`, `--border`, `--input`, `--radius` in `app.css`), Skeleton (`--color-primary-*`), DaisyUI (`--p`, `--rounded-btn`), Flowbite, or a design-system package's CSS.
4. **The global stylesheet's element rules**: `body { font-family }`, `button { … }`, `input { … }`, `a { color }`.
5. **Dark mode**: a `.dark` class, `[data-theme="dark"]` or `@media (prefers-color-scheme: dark)`. Set the tokens for each mode under the same selector the app uses.

## Step 2: map it onto the tokens

Set the tokens in the app's own global stylesheet, outside any `@layer`, pointing at the app's own variables where it has them (so Bridge follows later changes):

```css
/* src/app.css */
:root {
  --bridge-primary: var(--color-brand-600);
  --bridge-primary-fg: #ffffff;
  --bridge-border: var(--color-slate-200);
  --bridge-border-radius: var(--radius-lg);
}
```

| App value | Token |
|---|---|
| Brand / primary colour (main button background) | `--bridge-primary` |
| Its hover shade | `--bridge-primary-hover` (default: primary, 15% darker) |
| Text on the primary colour | `--bridge-primary-fg` |
| A light tint of the primary (selected rows) | `--bridge-primary-light` |
| Focus ring colour | `--bridge-input-focus` (default: primary) |
| Surfaces: dialogs, menus, panels | `--bridge-bg`, text on them `--bridge-foreground` |
| Plan cards and the current-plan panel | `--bridge-card-bg` (default `--bridge-bg`) |
| Secondary text | `--bridge-muted`; subtle fills (tab tracks, hovers) `--bridge-muted-bg` |
| Borders of inputs, tables, cards, secondary buttons | `--bridge-border` |
| Corners of inputs, buttons, alerts, cards, dialogs | `--bridge-border-radius` |
| Input fill and text (dark themes) | `--bridge-input-bg`, `--bridge-input-fg` (default: the browser's own field colours) |
| Spacing inside inputs and buttons | `--bridge-input-padding` (default `0.5rem 0.75rem`), `--bridge-button-padding` (default `0.5rem 1rem`) |
| Page spacing | `--bridge-auth-page-padding` (sign-in pages), `--bridge-billing-page-padding`, `--bridge-billing-page-width` (plan pages) |
| Dialog backdrop | `--bridge-overlay` |
| Font, only if Bridge should differ from the body | `--bridge-font-family`, `--bridge-font-size` |
| Heading, button and label weights | `--bridge-font-weight-heading`, `--bridge-font-weight-button`, `--bridge-font-weight-label` |
| Button and card shadows | `--bridge-button-shadow`, `--bridge-card-shadow` (`none` gives a flat look, which suits most dark themes) |
| Notices | `--bridge-alert-error-bg` / `--bridge-alert-error-fg` / `--bridge-alert-error-border`, and the same for `success`, `info` and `warning` |

Do not set `--bridge-font-family` or `--bridge-font-size` to the app's own font: Bridge already inherits it. Text colour is not a token: Bridge's pages inherit the app's.

**Tailwind v4**, pointing at the theme:

```css
@import 'tailwindcss';

:root {
  --bridge-primary: var(--color-teal-700);
  --bridge-primary-hover: var(--color-teal-800);
  --bridge-foreground: var(--color-slate-900);
  --bridge-muted: var(--color-slate-500);
  --bridge-muted-bg: var(--color-slate-100);
  --bridge-border: var(--color-slate-200);
  --bridge-border-radius: var(--radius-lg);
  --bridge-button-padding: var(--spacing-2) var(--spacing-4);
}
```

If a Tailwind variable resolves to nothing, Tailwind emitted only the theme variables it saw used: declare the block with `@theme static`. **Tailwind v3**: the same with `theme('colors.teal.700')`, `theme('borderRadius.lg')`.

**shadcn-svelte** (its variables hold whole colours in recent versions; with older HSL triplets wrap them in `hsl(var(--primary))`):

```css
:root, .dark {
  --bridge-primary: var(--primary);
  --bridge-primary-fg: var(--primary-foreground);
  --bridge-bg: var(--background);
  --bridge-card-bg: var(--card);
  --bridge-foreground: var(--foreground);
  --bridge-muted: var(--muted-foreground);
  --bridge-muted-bg: var(--muted);
  --bridge-border: var(--border);
  --bridge-input-bg: var(--background);
  --bridge-input-fg: var(--foreground);
  --bridge-border-radius: var(--radius);
}
```

**A dark theme**, set under the app's own dark selector:

```css
.dark {
  --bridge-bg: #0b1220;
  --bridge-card-bg: #111827;
  --bridge-foreground: #e5e7eb;
  --bridge-muted: #9ca3af;
  --bridge-muted-bg: #1f2937;
  --bridge-border: #374151;
  --bridge-input-bg: #111827;
  --bridge-input-fg: #e5e7eb;
  --bridge-card-shadow: none;
}
```

A token set on a wrapper themes only that area (`<div style="--bridge-primary: #7c3aed">`).

## Step 3: only what the tokens do not cover

Write plain CSS, outside any `@layer`, against Bridge's classes and data attributes (`.bridge-btn-primary`, `[data-bridge-auth-form]`, `[data-bridge-plan-card]`, `[data-current="true"]`, `[data-variant="error"]`). It wins with no `!important`:

```css
.bridge-btn-primary:hover { transform: translate(-2px, -2px); }
[data-bridge-plan-card][data-current="true"] { border-width: 2px; }
```

Tailwind utilities on a Bridge component's `class` prop lose wherever Bridge sets the same property (Tailwind's layer comes before Bridge's); use plain CSS there, or Tailwind's important modifier. Never copy Bridge's component markup or edit its internals; for a different layout use the `frame` / `heading` snippets of `<BridgeAuthRoutes>` and `<BridgeBillingRoutes>`, or take over one page (`bridge guide svelte sdk-auth`).

## Step 4: check it

Run the terminal checks. If you have a browser tool, run the browser checks too. If you do not, list them for the developer, numbered, and start the summary with a Heads up line saying which checks were not run.

### Terminal checks

1. The build passes.
2. Every `--bridge-*` name you set is one of the tokens in the table above (a misspelt token is silently ignored).
3. The tokens sit in the app's own stylesheet, outside any `@layer`, and the styles import is still in the root layout.

### Browser checks

1. `/auth/sign-in` and `/auth/sign-up`: the primary button, inputs, corners and spacing match the app's own buttons and forms; in dark mode the inputs are dark too.
2. `/subscription/plan`: the plan cards use the app's surfaces, borders and corners.
3. The team page (`<TeamPanel>`): the tabs, the table and the invite dialog match.
4. Side by side with one of the app's own forms, nothing looks borrowed.

When a check was not run, the summary starts with "Heads up: not verified in a browser" and lists it for the developer.

## Common mistakes

- Leaving Bridge's default indigo in an app that has its own primary colour.
- Restyling with `!important` or deep selectors when a token exists.
- Setting tokens inside an `@layer` declared before `bridge`: they then lose.
- Hard-coding the app's colours when it has variables: point at its variables, so Bridge follows a later theme change.
- Dropping the styles import to "start clean": components then render as plain HTML.
