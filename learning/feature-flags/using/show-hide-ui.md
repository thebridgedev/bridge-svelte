# Show or hide UI

The most common thing to do with a flag is decide whether a piece of UI renders at all. The `<FeatureFlag>` component does that declaratively, with optional fallback content for the off case. The snippets receive the evaluated value:

```svelte
<script lang="ts">
  import { FeatureFlag } from '@nebulr-group/bridge-svelte/flags';
</script>

<FeatureFlag key="new_dashboard" defaultValue={false}>
  <NewDashboard />
</FeatureFlag>

<!-- With fallback for the non-matching case: -->
<FeatureFlag key="premium_feature" defaultValue={false}>
  {#snippet children(value)}
    <button>Use premium feature</button>
  {/snippet}
  {#snippet fallback(value)}
    <button disabled title="Upgrade to unlock">Premium (locked)</button>
  {/snippet}
</FeatureFlag>
```

## Sending context

`<FeatureFlag>` takes the same per-call eval context (the identity and attributes a flag rule evaluates against) as `useFlag`'s third argument. Use it when the rule targets an app-specific attribute Bridge doesn't already know (see [Send context from your code](/feature-flags/targeting/send-context/)):

```svelte
<FeatureFlag
  key="new_dashboard"
  defaultValue={false}
  context={{ attributes: { project_count: projects.length } }}
>
  <NewDashboard />
</FeatureFlag>
```

Since `context` is a plain prop, it's reactive for free: Svelte re-evaluates the object expression (and re-renders the flag) whenever `projects.length` changes, with no getter function needed the way `useFlag` requires for its standalone rune.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `key` | `string` | **(required)** | The flag key |
| `defaultValue` | `T` | **(required)** | Safe value; also sets the flag's inferred type |
| `context` | `Partial<EvalContext>` | (none) | Per-call eval context (attributes win on collision) |
| `children` | snippet | (none) | Rendered when the flag passes; receives the value |
| `fallback` | snippet | (none) | Rendered when it doesn't; receives the value |
