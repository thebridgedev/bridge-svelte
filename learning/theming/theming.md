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

The plugin declares its defaults on `:where(:root)`, which has zero specificity, so your `:root` wins whatever order the two stylesheets load in. Set a token on a wrapper instead of `:root` to theme one area (`<div style="--bridge-primary: #7c3aed">`). Tokens are rung 1 of the customisation rungs in [How Bridge works](../mechanisms.md): rung 0 is your layout around every Bridge page, then the `frame` / `heading` snippets (2), taking over one page (3) and headless (4).

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
| `--bridge-overlay` | `rgba(15, 23, 42, 0.45)` | Backdrop behind dialogs |
| `--bridge-alert-error-bg` / `-fg` / `-border` | `#fef2f2` / `#991b1b` / `#fca5a5` | Errors, critical billing notices, cancelled plan badge |
| `--bridge-alert-success-bg` / `-fg` / `-border` | `#f0fdf4` / `#166534` / `#86efac` | Confirmations, active plan badge |
| `--bridge-alert-info-bg` / `-fg` / `-border` | `#eff6ff` / `#1e40af` / `#bfdbfe` | Info notices, trial badge |
| `--bridge-alert-warning-bg` / `-fg` / `-border` | `#fffbeb` / `#92400e` / `#fcd34d` | Warnings, a quota nearing its limit, past-due badge |

The three derived tokens (`-hover`, `-light`, `--bridge-input-focus`) follow `--bridge-primary` wherever you set it, unless you set them too.

### Layout

| Token | Default | Styles |
|---|---|---|
| `--bridge-auth-page-padding` | `3rem 1rem` | The default container of the sign-in pages (`<BridgeAuthRoutes>`) |
| `--bridge-billing-page-width` | `60rem` | The subscription pages (`<BridgeBillingRoutes>`, `<BridgePaywallPage>`) |
| `--bridge-billing-page-padding` | `3rem 1rem` | The subscription pages |
| `--bridge-paywall-bg` | `rgba(15, 23, 42, 0.72)` | Backdrop of the `<BridgePaywall>` overlay and the billing lockscreen |
| `--bridge-paywall-panel-bg` | `--bridge-bg` | Panel of the `<BridgePaywall>` overlay |

### Not tokens

Fonts and body text colour. Bridge pages render inside your `+layout.svelte`, so they inherit your font, text colour and background like any other page.

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

Utility classes still work on anything that takes a `class` prop, and on your own markup inside the `frame` snippet.

## Zero specificity

All visual-default rules, and the token defaults on `:where(:root)`, use the `:where()` pseudo-class, which has zero specificity. Any class or element selector in your own CSS wins automatically, no `!important` needed.

For example, the default primary button is styled as:

```css
:where(.bridge-btn-primary) {
  background-color: var(--bridge-primary);
  /* ... */
}
```

Your own `.bridge-btn-primary { background: red; }` or even a simple `.my-button { background: red; }` will override it without specificity battles.

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

You can also use the `style` prop for inline overrides:

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
