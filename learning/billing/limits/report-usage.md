# Report usage

A **metered quota** bills a workspace (called a *tenant* in the API) for what it actually uses: AI calls, messages sent, rows processed. Bridge can only meter what your app tells it about, so for every metered metric you report each unit of usage as it happens. This page covers reporting; to define the quota on the plan see [Define your plans](/billing/setup/define-plans/), and to show a workspace how close it is to a cap see [Show usage limits](/billing/limits/usage-limits/).

## Report a usage event

Call `bridge.usage.report(metric, value)` whenever the metered action happens. It is fire-and-forget: the call returns immediately and never throws into your code path, so you can drop it straight into a handler.

```ts
import { bridge } from '@nebulr-group/bridge-svelte';

// One unit (value defaults to 1)
bridge.usage.report('ai_completions');

// Report N units at once
bridge.usage.report('tokens', 1375);
```

The `metric` string must match the metric key of a quota on the plan (the `--metric` you passed to `bridge plan quota set`). Reporting a metric with no matching quota is harmless; it is simply counted and available for later.

## Set a gauge

`report` is for **counters**: something happened, and Bridge adds it up. For a **gauge**, a count of things that exist right now (projects, documents), tell Bridge the current total after every create and delete:

```ts
await bridge.usage.set('projects', projects.length);
```

If deleting it frees room, it's a gauge and your app counts it (`set`). If it happened, it's a counter and Bridge counts it (`report`). `set` sends the absolute value (never added up), resolves once Bridge has stored it, and rejects if Bridge refused it. See [Show usage limits](/billing/limits/usage-limits/#counter-or-gauge) for choosing the kind on the plan.

## Count once, where the action happens

Report from the browser when the action happens in the browser: a local-first or mobile app whose data lives on the device, or any click that does not call your server. That is a complete, first-class setup: put `<QuotaGate metric>` around the button so it stops at the limit, and Bridge shows and bills what the page reports.

When the click calls your server, the backend handler counts it instead (for NestJS, `@RequireQuota` / `@SyncQuota`), and the page only shows the number. Never both: the same action would be counted twice. In development the plugin warns once in the console when your backend and the page count the same metric (bridge-nestjs marks a counting response with `X-Bridge-Usage-Counted` outside production; nothing is sent or printed in production).

## What happens to a reported event

You do not have to manage batching, retries, or network failures. The reporter handles all of it:

- **Batched:** events are buffered and flushed together (by default 10 events or every second), so reporting on a hot path stays cheap.
- **Durable:** each accepted event is persisted locally (IndexedDB in the browser) before it is sent, so a page navigation, reload, or crash cannot lose it. On the next load the reporter replays anything unsent.
- **Idempotent:** every event carries an idempotency key (generated for you when you omit it) that survives those replays, so the server counts each event once even if it is sent twice.
- **Per workspace:** usage is billed to the signed-in user's workspace, which the server derives from the access token. Events reported without a signed-in user are dropped rather than mis-attributed, so report usage only from authenticated parts of your app.

Because of the idempotency key, you can pass your own when a single logical action might fire `report` more than once (a component re-render, a retried request) and want the server to dedupe them:

```ts
bridge.usage.report('report_generated', 1, `report:${reportId}`);
```

## Check the queue while developing

To confirm events are flowing, or to surface reporter health in an internal dashboard, read the queue status:

```ts
const status = await bridge.usage.getQueueStatus();
// { queueDepth, retryCount, lastFlushTimestamp, lastFlushError }
```

`queueDepth` is how many events are waiting, `lastFlushError` is the last send error (or `null` when the last flush was clean). This is for observability only; you never need it to make reporting work.

> Reporting records usage; it does not block the action. To stop a workspace once it is over its allowance, gate the feature on the quota state (see [Show usage limits](/billing/limits/usage-limits/)) or on an [entitlement](/billing/limits/lock-features/).
