# bridge-svelte Component Authoring Guide

A concise reference for anyone building new bridge-svelte components.

---

## 1. The Headless Contract

Every component that renders HTML **must**:

- Accept and apply `class`, `style`, and `...rest` HTML attributes on its root element
- Export **zero default styles** — no `<style>` block
- Express state via `data-*` attributes, not CSS class modifiers
- Have a stable `data-bridge-{name}` identity attribute on its root element

Consumers opt into the default appearance by importing `@nebulr-group/bridge-svelte/styles`.

---

## 2. The Props Pattern

```svelte
<script lang="ts">
  import type { HTMLDivAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';

  interface Props extends HTMLDivAttributes {
    // component-specific props
    variant?: 'default' | 'danger';
    children?: Snippet;
  }

  let { variant = 'default', children, class: className, style, ...rest }: Props = $props();
</script>

<div
  class={className}
  {style}
  data-bridge-my-component
  data-variant={variant}
  {...rest}
>
  {@render children?.()}
</div>
<!-- no <style> block -->
```

**Rules:**
- Always rename `class` to `className` in destructuring to avoid keyword collision
- Use the appropriate HTML element type: `HTMLDivAttributes`, `HTMLButtonAttributes`, `HTMLDialogAttributes`, etc. (imported from `svelte/elements`)
- `...rest` must be spread **last** on the root element so consumers can override any attribute
- The `data-bridge-{name}` attribute is the stable CSS identity — never remove or rename it

---

## 3. State via Data Attributes

Replace CSS class modifiers (BEM) with `data-*` attributes:

| Instead of | Use |
|---|---|
| `class:active={isActive}` | `data-active={isActive}` |
| `class="btn btn--loading"` | `class="bridge-btn" data-loading={loading}` |
| `class="status status--error"` | `class="bridge-status" data-state="error"` |
| `class:bridge-tab--active={isActive}` | `data-active={activeTab === tab.id}` |

CSS in `styles.css` targets these as:

```css
[data-active="true"] { /* active styles */ }
[data-loading="true"] { /* loading styles */ }
[data-state="error"] { /* error state */ }
[data-variant="danger"] { /* danger variant */ }
```

> **Note:** Always use `[data-foo="true"]` (string comparison), not `[data-foo]` (presence check), for boolean attributes. This matches how Svelte renders `data-foo={true}`.

---

## 4. Snippet Props for Layout Sections

For any section a consumer might want to replace entirely (heading, footer, action buttons, item rows), add a snippet prop:

```svelte
interface Props extends HTMLDivAttributes {
  // string fallback for simple cases — keep for backwards compat
  heading?: string;
  // snippet override for full control
  headingSnippet?: Snippet;
  // snippet with state args for interactive sections
  actions?: Snippet<[{ loading: boolean; onSubmit: () => void }]>;
  // standard children
  children?: Snippet;
}
```

Render snippets with fallback to the default UI:

```svelte
{#if headingSnippet}
  {@render headingSnippet()}
{:else if heading}
  <h2>{heading}</h2>
{/if}
```

**Pass state the consumer needs as snippet arguments:**

```svelte
{#if actions}
  {@render actions({ loading, onSubmit: handleSubmit })}
{:else}
  <!-- default action buttons -->
{/if}
```

**Naming caution:** If a component already has a `title?: string` prop, name the snippet `titleSnippet` to avoid collision:

```svelte
interface Props {
  title?: string;        // existing prop
  titleSnippet?: Snippet; // snippet override
}
```

---

## 5. Styles in `styles.css`

All default appearance lives in `src/lib/styles.css`. New component styles go in a clearly labelled section at the end.

**Selector conventions:**

```css
/* ─── My Component ──────────────────────────────────────────────────── */

/* Root element — use the data-bridge-{name} identity attribute */
[data-bridge-my-component] {
  /* base styles */
}

/* State variants via data attributes */
[data-bridge-my-component][data-state="error"] {
  /* error state styles */
}

[data-bridge-my-component][data-loading="true"] {
  /* loading state */
}
```

**Always use CSS custom properties for colors:**

```css
[data-bridge-my-component] {
  background: var(--bridge-primary, #3b82f6);
  color: var(--bridge-primary-foreground, #ffffff);
}
```

Never hardcode hex values — consumers can override via `--bridge-*` variables.

---

## 6. The `cn()` Utility

Available at `$lib/client/utils/cn.ts`. Use only when a component needs to **merge** an internal base class with the consumer's `class` prop:

```ts
import { cn } from '$lib/client/utils/cn.js';

// Example: always apply bridge-btn as base, merge consumer class on top
class={cn('bridge-btn', className)}
```

Most components should pass `className` directly without merging, since there is no `<style>` block with internal class definitions. Use `cn()` only when the component intentionally relies on a class from `styles.css` as its base.

---

## 7. Quick Checklist

Before submitting a new component, verify:

- [ ] Root element has `class={className} {style} data-bridge-{name} {...rest}`
- [ ] Props interface extends the appropriate `HTML*Attributes` type
- [ ] No `<style>` block in the component file
- [ ] All styles added to `styles.css` under a labelled section
- [ ] State expressed via `data-*` attributes, not CSS class modifiers
- [ ] Boolean `data-*` attributes use `data-foo={value}` (renders as `"true"`/`"false"`)
- [ ] Snippet props added for any layout section a consumer might want to replace
- [ ] `svelte-autofixer` reports no issues

---

## 8. Example: Complete Headless Component

```svelte
<!-- src/lib/client/components/example/StatusBadge.svelte -->
<script lang="ts">
  import type { HTMLSpanAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';

  type Status = 'active' | 'inactive' | 'pending';

  interface Props extends HTMLSpanAttributes {
    status: Status;
    label?: string;
    icon?: Snippet;
    children?: Snippet;
  }

  let { status, label, icon, children, class: className, style, ...rest }: Props = $props();
</script>

<span
  class={className}
  {style}
  data-bridge-status-badge
  data-status={status}
  {...rest}
>
  {#if icon}
    {@render icon()}
  {/if}
  {#if children}
    {@render children()}
  {:else if label}
    {label}
  {/if}
</span>
<!-- no <style> block -->
```

Corresponding CSS in `styles.css`:

```css
/* ─── StatusBadge ───────────────────────────────────────────────────── */
[data-bridge-status-badge] {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
}

[data-bridge-status-badge][data-status="active"] {
  background: var(--bridge-success-bg, #dcfce7);
  color: var(--bridge-success, #16a34a);
}

[data-bridge-status-badge][data-status="inactive"] {
  background: var(--bridge-muted-bg, #f3f4f6);
  color: var(--bridge-muted, #6b7280);
}

[data-bridge-status-badge][data-status="pending"] {
  background: var(--bridge-warning-bg, #fef9c3);
  color: var(--bridge-warning, #ca8a04);
}
```
