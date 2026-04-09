# Theming & Styles

## Overview

Bridge components ship with optional default styles. Import them for a ready-to-use appearance, or skip the import entirely for headless usage where you control all styling yourself.

## Importing styles

Add this import to your root layout or global CSS:

```ts
import '@nebulr-group/bridge-svelte/styles';
```

The stylesheet provides two layers:

- **Structural CSS** — layout, spacing, and sizing that components need to render correctly.
- **Visual defaults** — a minimal but complete out-of-the-box appearance so forms look reasonable with no extra work. These include a visible input border/focus ring, an indigo primary button, and colored error/success alert banners.

## CSS variables reference

All visual defaults are driven by CSS custom properties defined on `:root`. Override any of them in your own CSS to theme the components:

```css
/* app.css or +layout.svelte <style> */
:root {
  --bridge-primary: #4f46e5;          /* button + focus ring color */
  --bridge-primary-hover: #4338ca;    /* button hover state */
  --bridge-primary-fg: #ffffff;       /* text on primary button */
  --bridge-border: #d1d5db;           /* input + secondary button border */
  --bridge-border-radius: 6px;        /* corners for inputs, buttons, alerts */
  --bridge-input-focus: #4f46e5;      /* input focus-ring color */

  /* alert colors */
  --bridge-alert-error-bg: #fef2f2;
  --bridge-alert-error-fg: #991b1b;
  --bridge-alert-error-border: #fca5a5;
  --bridge-alert-success-bg: #f0fdf4;
  --bridge-alert-success-fg: #166534;
  --bridge-alert-success-border: #86efac;
}
```

### Additional internal variables

These variables are used by specific components and can also be overridden:

| Variable | Default | Used by |
|----------|---------|---------|
| `--bridge-muted` | `#6b7280` | Password toggle, MFA help text, token table headings, workspace user text |
| `--bridge-foreground` | `#374151` | Password toggle hover, workspace name text |
| `--bridge-bg-muted` | `#f5f5f5` | MFA backup code background |
| `--bridge-muted-bg` | `#f3f4f6` | Workspace item hover background |
| `--bridge-primary-light` | `#eff6ff` | Active workspace item background |
| `--bridge-primary-foreground` | `#ffffff` | Workspace avatar text color |

## Zero specificity

All visual-default rules use the `:where()` pseudo-class, which has zero specificity. This means any class or element selector in your own CSS wins automatically — no `!important` needed.

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
| `[data-bridge-plan-selector]` | — | Plan selector root |
| `[data-bridge-plan-card]` | — | Individual plan card |
| `[data-current="true"]` | `"true"` / `"false"` | Current plan card |
| `[data-bridge-alert]` | — | Alert component |
| `[data-bridge-auth-form]` | — | Auth form wrapper |
| `[data-bridge-passkey-login]` | — | Passkey login button |
| `[data-bridge-sso-button]` | — | SSO button |
| `[data-bridge-spinner]` | — | Loading spinner |
| `[data-bridge-api-tokens]` | — | API token management root |
| `[data-bridge-workspace-selector]` | — | Workspace selector root |
| `[data-bridge-workspace-item]` | — | Individual workspace item |

Example — style the active workspace differently:

```css
[data-bridge-workspace-item][data-active="true"] {
  background: var(--my-highlight);
  border-color: var(--my-accent);
}
```

## Headless usage

If you manage all styling yourself (e.g. you use Tailwind), skip the import entirely:

```diff
  // +layout.svelte
  <script lang="ts">
    import { BridgeBootstrap } from '@nebulr-group/bridge-svelte';
-   import '@nebulr-group/bridge-svelte/styles';
  </script>
```

Components render as plain, unstyled HTML. Use the `class` prop and the data attributes listed above to apply your own styles. The structural layout (flexbox, grid) is embedded in the stylesheet, so without it you have full control over how components are laid out.
