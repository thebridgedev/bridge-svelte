# Use flags on your backend

Evaluating a flag in Svelte is local and instant — great for the browser. But sometimes the same decision has to be made again on a backend you control: an API route that should only exist while a flag is on, or a server job that needs to agree with what the browser just decided. If each side evaluates independently, they can disagree — your Svelte app knows the visitor's identity and whatever attributes it set; a NestJS API has no way to know either unless you send them.

## Forwarding context from Svelte

Grab the context your `useFlag` calls are already using and attach it as a header on the request to your own API:

```ts
import { getBridgeFlagsInstance, serializeContext, BRIDGE_CONTEXT_HEADER } from '@nebulr-group/bridge-svelte/flags';

const context = getBridgeFlagsInstance()?.getContext();

await fetch('https://your-api.example.com/checkout', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(context ? { [BRIDGE_CONTEXT_HEADER]: serializeContext(context) } : {}),
  },
  body: JSON.stringify(order),
});
```

`getBridgeFlagsInstance().getContext()` returns the same `{ identity, attributes }` your `useFlag` calls resolve against — including anything you've set via per-call context or `bridge.attributes` (see [Send context from your code](/feature-flags/targeting/send-context/)).

## Reading it on a NestJS backend

`@nebulr-group/bridge-nestjs/flags` reads the header for you once `BridgeContextInterceptor` is wired up:

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { BridgeFlagsModule, BridgeContextInterceptor } from '@nebulr-group/bridge-nestjs/flags';

@Module({
  imports: [
    BridgeFlagsModule.forRoot({
      apiBaseUrl: 'https://api.thebridge.dev',
      apiKey: process.env.BRIDGE_API_KEY!,
    }),
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: BridgeContextInterceptor }],
})
export class AppModule {}
```

Evaluate the same flag key, with the propagated context applied automatically:

```ts
import { Controller, Post, Req } from '@nestjs/common';
import { BridgeFlagsService } from '@nebulr-group/bridge-nestjs/flags';

@Controller('checkout')
export class CheckoutController {
  constructor(private readonly flags: BridgeFlagsService) {}

  @Post()
  create(@Req() req) {
    const useV2 = this.flags.flag('pricing_engine_v2', false, req.bridgeFlagsContext);
    return useV2 ? this.createV2(req.body) : this.createV1(req.body);
  }
}
```

Or gate the whole endpoint declaratively, so a request is rejected before your handler ever runs:

```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { BridgeFlagGuard, RequireFlag } from '@nebulr-group/bridge-nestjs/flags';

@Controller('beta')
@UseGuards(BridgeFlagGuard)
export class BetaController {
  @Get('feature-x')
  @RequireFlag('feature_x')
  getFeatureX() {
    /* only reachable when feature_x is on */
  }
}
```

## What to propagate — and what not to

Only forward identity and attributes the backend genuinely can't derive itself — an anonymous visitor ID, a cart size held in client state, a locale picked in the UI. Never forward `role`- or `plan`-style attributes: the backend should read those from its own verified sources (the user's JWT, its own tenant record), not trust a value the browser handed it.
