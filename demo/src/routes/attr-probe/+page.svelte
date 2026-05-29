<!--
  FF 2.0 release-validation — attribute probe route (TBP-241 Phase 2 + 4).

  Reads `?key=<flag-key>` and `?attrs=<base64-json>` (or `?attrs=<json>`) from
  the URL and references that flag via `useFlag(key, default, { attributes })`.

  Phase 4 extension (TBP-241): non-boolean value types. Adds:
    ?defaultType=<boolean|string|number|json>  — type of the dev default
    ?defaultValue=<json>                       — JSON-encoded default value

  Defaults: type='boolean', value=false (backwards-compatible with Phase 1/2/3).

  Observable indicators:
    [data-testid="probe-state"]      — "active"/"fallback" (truthy/falsy cast,
                                        preserved for backwards-compat)
    [data-testid="probe-value"]      — JSON-stringified resolved flag value
                                        (preserves type — string/number/json/bool)
    [data-testid="probe-value-type"] — typeof the resolved value (sanity for
                                        #32 number-preservation / #34 default-type)
    [data-testid="probe-key"]        — resolved key (sanity)
    [data-testid="probe-attrs"]      — JSON-stringified attrs (debug aid)
    [data-testid="probe-default"]    — JSON-stringified configured default
-->
<script lang="ts">
  import { page } from '$app/state';
  import { useFlag } from '@bridge-svelte/lib/flags';

  // Parse `?attrs=` (raw JSON) or `?attrs_b64=` (base64-encoded JSON).
  function parseAttrs(): Record<string, unknown> {
    const raw = page.url.searchParams.get('attrs');
    const b64 = page.url.searchParams.get('attrs_b64');
    let json: string | null = null;
    if (b64) {
      try {
        json = atob(b64);
      } catch {
        return {};
      }
    } else if (raw) {
      json = raw;
    }
    if (!json) return {};
    try {
      const parsed = JSON.parse(json);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  // Parse `?defaultType=` and `?defaultValue=`. Default falls back to
  // boolean/false so existing Phase 1/2/3 tests don't change.
  function parseDefault(): { type: 'boolean' | 'string' | 'number' | 'json'; value: unknown } {
    const typeParam = (page.url.searchParams.get('defaultType') ?? 'boolean').trim();
    const valParam = page.url.searchParams.get('defaultValue');
    const type =
      typeParam === 'string' || typeParam === 'number' || typeParam === 'json'
        ? typeParam
        : 'boolean';

    let value: unknown;
    if (valParam === null) {
      value =
        type === 'boolean' ? false : type === 'string' ? '' : type === 'number' ? 0 : {};
    } else {
      try {
        value = JSON.parse(valParam);
      } catch {
        // Fall back to the raw string if JSON.parse fails — useful for
        // string defaults supplied unquoted (e.g. ?defaultValue=light).
        value = type === 'string' ? valParam : value;
      }
    }
    return { type, value };
  }

  const flagKey = $derived((page.url.searchParams.get('key') ?? '').trim());
  const attrs = $derived(parseAttrs());
  const defaults = $derived(parseDefault());

  const flag = useFlag<unknown>(
    () => flagKey,
    () => defaults.value,
    () => ({ attributes: attrs }),
  );
  const state = $derived(flag.value ? 'active' : 'fallback');
  const valueJson = $derived(
    flag.value === undefined ? 'undefined' : JSON.stringify(flag.value),
  );
  const valueType = $derived(typeof flag.value);
</script>

<section>
  <h1>FF 2.0 attribute probe</h1>
  <p>
    Resolved flag key:
    <strong data-testid="probe-key">{flagKey || '(none)'}</strong>
  </p>
  <p>
    Attributes:
    <code data-testid="probe-attrs">{JSON.stringify(attrs)}</code>
  </p>
  <p>
    Default:
    <code data-testid="probe-default">{JSON.stringify(defaults.value)}</code>
    (<code>{defaults.type}</code>)
  </p>
  <p>
    State: <strong data-testid="probe-state">{state}</strong>
  </p>
  <p>
    Value: <code data-testid="probe-value">{valueJson}</code>
    (typeof <code data-testid="probe-value-type">{valueType}</code>)
  </p>
</section>
