# Theming & Styles

## Overview

Bridge components ship with optional default styles. Import them for a ready-to-use appearance, or skip the import entirely for headless usage where you control all styling yourself.

## Importing styles

Add this import to your root layout or global CSS:

```ts
import '@nebulr-group/bridge-svelte/styles';
```

The stylesheet provides two layers:

- **Structural CSS**: layout, spacing, and sizing that components need to render correctly.
- **Visual defaults**: a minimal but complete out-of-the-box appearance so forms look reasonable with no extra work. These include a visible input border/focus ring, an indigo primary button, and colored error/success alert banners.

All of it sits in a CSS cascade layer named `bridge`, so your own CSS wins over it (see [Your CSS wins](#your-css-wins)).

## Matching your app's look

Take these steps in order, and stop as soon as Bridge looks like the rest of your app:

1. **Nothing.** Bridge pages render inside your layout and inherit your font, text size and text colour.
2. **Set a few `--bridge-*` variables**: your primary colour, borders, corners, and if your app has a distinct type style, its weights and shadows. The tables below list them all.
3. **Write plain CSS** against Bridge's classes and data attributes for anything the variables don't cover. It wins over Bridge's styles with no `!important`.

For example, an app with heavy type and hard offset shadows gets there with variables alone:

```css
/* src/app.css */
:root {
  --bridge-primary: #ff6b2c;
  --bridge-primary-fg: #111;
  --bridge-border: #111;
  --bridge-border-radius: 10px;
  --bridge-font-weight-heading: 800;
  --bridge-font-weight-button: 800;
  --bridge-font-weight-label: 700;
  --bridge-button-shadow: 4px 4px 0 #111;
  --bridge-card-shadow: 6px 6px 0 #111;
}
```

And a press effect on its buttons is one plain rule:

```css
.bridge-btn-primary:hover {
  transform: translate(-2px, -2px);
}
```

## The token contract

The `--bridge-*` variables below are the supported way to restyle every Bridge page and component, kept stable across releases. Set them once in your app's stylesheet:

```css
/* src/app.css */
:root {
  --bridge-primary: #0f766e;
  --bridge-primary-fg: #ffffff;
  --bridge-border: #e2e8f0;
  --bridge-border-radius: 10px;
}
```

Bridge's defaults sit in its cascade layer, so your `:root` wins whatever order the two stylesheets load in. Set a token on a wrapper instead of `:root` to theme one area (`<div style="--bridge-primary: #7c3aed">`). Tokens are rung 1 of the customisation rungs in [How Bridge works](../mechanisms.md): rung 0 is your layout around every Bridge page, then the `frame` / `heading` snippets (2), taking over one page (3) and headless (4).

### Colour

| Token | Default | Styles |
|---|---|---|
| `--bridge-primary` | `#4f46e5` | Primary buttons, the selected tab and plan interval, the active workspace |
| `--bridge-primary-hover` | primary, 15% darker | Primary button hover |
| `--bridge-primary-fg` | `#ffffff` | Text on primary surfaces |
| `--bridge-primary-light` | primary at 10% | Tint behind the active workspace |
| `--bridge-input-focus` | primary | Input focus ring |
| `--bridge-bg` | `#ffffff` | Dialogs, menus, panels |
| `--bridge-foreground` | `#111827` | Text on those surfaces, workspace names |
| `--bridge-muted` | `#6b7280` | Secondary text, hints, table headings |
| `--bridge-muted-bg` | `#f3f4f6` | Subtle fills: tab tracks, hovers, the MFA backup code |
| `--bridge-border` | `#d1d5db` | Input, table, card and secondary button borders |
| `--bridge-border-radius` | `6px` | Corners of inputs, buttons, alerts, cards and dialogs |
| `--bridge-card-bg` | `--bridge-bg` | Plan cards and the current-plan panel on the subscription page |
| `--bridge-overlay` | `rgba(15, 23, 42, 0.45)` | Backdrop behind dialogs |
| `--bridge-alert-error-bg` / `-fg` / `-border` | `#fef2f2` / `#991b1b` / `#fca5a5` | Errors, critical billing notices, cancelled plan badge |
| `--bridge-alert-success-bg` / `-fg` / `-border` | `#f0fdf4` / `#166534` / `#86efac` | Confirmations, the checkout banner, active plan badge |
| `--bridge-alert-info-bg` / `-fg` / `-border` | `#eff6ff` / `#1e40af` / `#bfdbfe` | Info notices, trial badge |
| `--bridge-alert-warning-bg` / `-fg` / `-border` | `#fffbeb` / `#92400e` / `#fcd34d` | Warnings, a quota nearing its limit, past-due badge |

The three derived tokens (`-hover`, `-light`, `--bridge-input-focus`) follow `--bridge-primary` wherever you set it, unless you set them too.

### Type and shadow

Every default is the look Bridge has without them.

| Token | Default | Styles |
|---|---|---|
| `--bridge-font-size` | your `<body>` text size | The base every Bridge text size scales from. Set it only to size Bridge text differently from your body text, e.g. `18px` |
| `--bridge-font-weight-heading` | `600`, `700` on a few titles | Page, dialog and section titles, plan names, prices |
| `--bridge-font-weight-button` | `500` | Every Bridge button |
| `--bridge-font-weight-label` | `500`, `600` on a few | Form labels, table headings, badges, names |
| `--bridge-button-shadow` | `none` | Every Bridge button's shadow, e.g. `4px 4px 0 #111` |
| `--bridge-card-shadow` | a soft 1–3px shadow on cards, a deeper one on the dialog | Plan cards, the current-plan panel and the plan-change dialog. `none` gives a flat look, which suits most dark themes |

A weight token sets every element it covers to the same weight.

### Layout

| Token | Default | Styles |
|---|---|---|
| `--bridge-auth-page-padding` | `3rem 1rem` | The default container of the sign-in pages (`<BridgeAuthRoutes>`) |
| `--bridge-billing-page-width` | `60rem` | The subscription pages (`<BridgeBillingRoutes>`, `<BridgePaywallPage>`) |
| `--bridge-billing-page-padding` | `3rem 1rem` | The subscription pages |
| `--bridge-paywall-bg` | `rgba(15, 23, 42, 0.72)` | Backdrop of the `<BridgePaywall>` overlay and the billing lockscreen |
| `--bridge-paywall-panel-bg` | `--bridge-bg` | Panel of the `<BridgePaywall>` overlay |

### Not tokens

Font family and text colour. Bridge pages render inside your `+layout.svelte`, so they inherit your font, text colour and background like any other page. Text size follows your page too: every Bridge text size is relative to your `<body>` text size, so at the browser default of 16px nothing changes, and if your body text is 18px, Bridge's is sized to match. `--bridge-font-size` is there only for when Bridge should differ from your body.

### Deprecated names

Two tokens had two names. The old ones keep working, and will be removed in a later major version:

| Deprecated | Use |
|---|---|
| `--bridge-primary-foreground` | `--bridge-primary-fg` |
| `--bridge-bg-muted` | `--bridge-muted-bg` |

## Tailwind

Keep the styles import and point the tokens at your Tailwind theme, so Bridge follows it. Tailwind v4 exposes the theme as CSS variables:

```css
/* src/app.css */
@import 'tailwindcss';

@theme {
  --color-brand-600: #0f766e;
  --color-brand-700: #115e59;
}

:root {
  --bridge-primary: var(--color-brand-600);
  --bridge-primary-hover: var(--color-brand-700);
  --bridge-primary-fg: var(--color-white);
  --bridge-foreground: var(--color-slate-900);
  --bridge-muted: var(--color-slate-500);
  --bridge-muted-bg: var(--color-slate-100);
  --bridge-border: var(--color-slate-200);
  --bridge-border-radius: var(--radius-lg);
}
```

If a Tailwind variable resolves to nothing, your Tailwind version emits only the theme variables it sees used; declare the block with `@theme static` to keep them all.

On Tailwind v3, the same with `theme()`:

```css
:root {
  --bridge-primary: theme('colors.teal.700');
  --bridge-primary-hover: theme('colors.teal.800');
  --bridge-border: theme('colors.slate.200');
  --bridge-border-radius: theme('borderRadius.lg');
}
```

Utility classes work in full on your own markup, including inside the `frame` snippet. On Bridge's own elements, and on a component's `class` prop, a utility loses wherever Bridge sets the same property: Tailwind puts its utilities in a cascade layer that comes before Bridge's. Use plain CSS for those (see [Your CSS wins](#your-css-wins)), or Tailwind's important modifier (`bg-red-500!` in v4, `!bg-red-500` in v3).

Bridge declares its layer after Tailwind v4's (`@layer theme, base, components, utilities, bridge;`), so Tailwind's base reset never strips Bridge's buttons, whichever stylesheet loads first.

## Your CSS wins

Every Bridge style, in the stylesheet and in the components themselves, lives in a CSS cascade layer named `bridge`. Any CSS you write outside a layer overrides it, whatever its specificity and whatever the load order, with no `!important`:

```css
.bridge-btn-primary:hover {
  transform: translate(-2px, -2px);
}

[data-bridge-plan-card] {
  border-width: 2px;
}
```

A plain `.bridge-btn-primary { background: red; }` is enough; there is no specificity to match.

The one exception is CSS you put in a layer of your own. A layer declared before `bridge` ranks below it, so write overrides outside any `@layer`, or in a layer declared after `bridge`.

## Component-level overrides

All components forward `class` and `style` props to their root element, so you can target them directly:

```svelte
<LoginForm class="my-login-form" />
```

```css
.my-login-form input {
  border-radius: 0;   /* square inputs */
}
```

Plain CSS like this wins over Bridge's styles; Tailwind utilities in `class` follow the rule in [Tailwind](#tailwind). You can also use the `style` prop for inline overrides:

```svelte
<LoginForm style="--bridge-primary: #7c3aed;" />
```

## Data attributes for state-based styling

Bridge components expose data attributes that you can use as CSS selectors for state-based styling:

| Attribute | Values | Description |
|-----------|--------|-------------|
| `[data-active="true"]` | `"true"` | Active tab |
| `[data-loading="true"]` | `"true"` | Loading state |
| `[data-state="active"]` | `"active"` | Active status |
| `[data-state="disabled"]` | `"disabled"` | Disabled status |
| `[data-variant="error"]` | `"error"` | Error variant (alerts) |
| `[data-variant="info"]` | `"info"` | Info variant (alerts) |
| `[data-variant="success"]` | `"success"` | Success variant (alerts) |
| `[data-variant="danger"]` | `"danger"` | Danger variant (alerts) |
| `[data-bridge-plan-selector]` | (none) | Plan selector root |
| `[data-bridge-plan-card]` | (none) | Individual plan card |
| `[data-current="true"]` | `"true"` / `"false"` | Current plan card |
| `[data-bridge-alert]` | (none) | Alert component |
| `[data-bridge-auth-form]` | (none) | Auth form wrapper |
| `[data-bridge-passkey-login]` | (none) | Passkey login button |
| `[data-bridge-sso-button]` | (none) | SSO button |
| `[data-bridge-spinner]` | (none) | Loading spinner |
| `[data-bridge-api-tokens]` | (none) | API token management root |
| `[data-bridge-workspace-selector]` | (none) | Workspace selector root |
| `[data-bridge-workspace-item]` | (none) | Individual workspace item |

Example: style the active workspace differently.

```css
[data-bridge-workspace-item][data-active="true"] {
  background: var(--my-highlight);
  border-color: var(--my-accent);
}
```

## Headless usage

If you would rather style every component from scratch, skip the import entirely:

```diff
  // +layout.svelte
  <script lang="ts">
    import { BridgeBootstrap } from '@nebulr-group/bridge-svelte';
-   import '@nebulr-group/bridge-svelte/styles';
  </script>
```

Components render as plain, unstyled HTML. Use the `class` prop and the data attributes listed above to apply your own styles. The structural layout (flexbox, grid) is embedded in the stylesheet, so without it you have full control over how components are laid out.
