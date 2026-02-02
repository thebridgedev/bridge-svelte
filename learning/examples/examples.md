# Bridge Svelte Examples

Here we are showing bridge features of The Bridge svelte plugin. 
You can also see the features in action in our demo application in this monorepo

To start bridge demo app:
```bash

##from bridge project root
bun install
bun run dev
```

## Table of Contents
- [authentication](#authentication)
  - [Renewing User Tokens](#renewing-user-tokens)
  - [Checking authentication Status](#checking-if-a-user-is-logged-in)
  - [Getting User Profile Information](#getting-user-profile-information)
  - [Logout Functionality](#logout-functionality)
  - [Route Protection](#route-protection)
- [Feature Flags](#feature-flags)
  - [Bulk Fetching vs Live Updates](#bulk-fetching-vs-live)
  - [Basic Feature Flag Usage](#a-basic-feature-flag)
  - [Live Feature Flag Updates](#live-getting-a-feature-flag)
  - [Conditional Rendering with Feature Flags](#if-else-if-a-featureflag-is-disabled-bridgen-show-this)
  - [Route Protection with Feature Flags](#feature-flags-on-routes)
  - [Server-Side Feature Flags](#feature-flags-on-server-side-code-like-apis)
  - [Usage Service Pattern for Plan Limits](#usage-service-pattern-for-plan-limits)
  - [App Logic Integration with Usage Tracking](#app-logic-integration-with-usage-tracking)
  - [UI Components with Feature Flags and Upgrade CTAs](#ui-components-with-feature-flags-and-upgrade-ctas)
  - [Library View Upgrade CTA](#library-view-upgrade-cta)
  - [Chat View Upgrade CTA](#chat-view-upgrade-cta)
- [Payments & Subscriptions](#payments--subscriptions)
  - [Fetching Available Plans](#fetching-available-plans)
  - [Checking Current Plan Status](#checking-current-plan-status)
  - [Selecting or Changing Plans](#selecting-or-changing-plans)
  - [Redirecting to Subscription Portal](#redirecting-to-subscription-portal)
  - [Redirecting to Plan Selection](#redirecting-to-plan-selection)
  - [Complete Plan Selection Example](#complete-plan-selection-example)
- [Server-Side Rendering](#server-side-rendering)
- [Configuration](#configuration)
  - [Getting Config Values](#getting-config-values)
  - [Environment Variables](#environment-variables)
  - [Additional Configs](#additional-configs)

## authentication

### Route Protection

Bridge can protect routes in your Svelte application:

#### Using BridgeBootstrap

The most comprehensive way to protect routes is using bridge `BridgeBootstrap` component with a `routeConfig`:

```ts
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { BridgeBootstrap } from '@nebulr-group/bridge-svelte';
  let loading = $state(true);

  const routeConfig = {
    rules: [
      { match: '/', public: true },
      { match: '/login', public: true },
      { match: new RegExp('^/auth/oauth-callback$'), public: true },
      { match: '/beta/*', featureFlag: 'beta-feature', redirectTo: '/' }
    ],
    defaultAccess: 'protected'
  };

  function onBootstrapComplete() {
    loading = false;
  }
</script>

<BridgeBootstrap routeConfig={routeConfig} onBootstrapComplete={onBootstrapComplete} />

{#if !loading}
  <slot />
{/if}
```

This approach:
- **defaultAccess**: sets whebridger unmatched routes are public or protected
- **rules**: lets you mark individual paths as public and/or gate routes behind feature flags
- Handles redirects automatically


### Renewing User Tokens

Bridge automatically handles token renewal for you. The token service will refresh tokens before bridgey expire to ensure a seamless user experience.

### Checking if a User is Logged In

You can use bridge `auth` service to check if a user is currently logged in:

```ts
<!-- src/components/AuthStatus.svelte -->
<script lang="ts">
  import { auth } from '@nebulr-group/bridge-svelte';
  const { isAuthenticated, isLoading } = auth;
</script>

{#if isLoading}
  <div>Loading...</div>
{:else}
  <div>
    {#if $isAuthenticated}
      You are logged in!
    {:else}
      Please log in to continue
    {/if}
  </div>
{/if}
```

### Getting User Profile Information

Access the current user's profile information using `profileStore`:

```svelte
<script lang="ts">
  import { profileStore } from '@nebulr-group/bridge-svelte';
  const { profile } = profileStore;
</script>

{#if $profile}
  <div class="profile-details">
    <h2>Your Profile</h2>
    <p><strong>Name:</strong> {$profile.fullName}</p>
    <p><strong>Email:</strong> {$profile.email}</p>
    <p><strong>Username:</strong> {$profile.username}</p>
    
    {#if $profile.tenant}
      <div style="margin-top: 1rem;">
        <h3>Tenant Information</h3>
        <p><strong>Tenant Name:</strong> {$profile.tenant.name}</p>
        <p><strong>Tenant ID:</strong> {$profile.tenant.id}</p>
      </div>
    {/if}
  </div>
{:else if $profile === undefined}
  <div class="avatar loading">Loading...</div>
{:else}
  <div class="avatar">Not logged in</div>
{/if}
```

### Logout Functionality

To log out a user, use the `logout` function from the `auth` service:

```svelte
<script lang="ts">
  import { auth, profileStore } from '@nebulr-group/bridge-svelte';
  import { goto } from '$app/navigation';
  
  const { profile } = profileStore;
  const { logout } = auth;

  async function handleLogout() {
    await logout();
    goto('/');
  }
</script>

{#if $profile}
  <button class="btn-logout" onclick={handleLogout}>
    Logout
  </button>
{/if}
```


## Feature Flags

### Bulk Fetching vs Live

Bridge provides two ways to work with feature flags:

1. **Bulk Fetching (Recommended)**: Get all feature flags at once and use bridgem throughout your application. This approach uses a 5-minute cache to improve performance.
2. **Live Updates**: Check feature flags individually with real-time updates, bypassing bridge cache.

The recommended approach is to use bulk fetching with caching for better performance, simply using bridge featureflag component will use bridge cached response :

```ts
<!-- src/components/CachedFeatureExample.svelte -->
<script lang="ts">
  import { FeatureFlag } from '@nebulr-group/bridge-svelte';
</script>

<FeatureFlag flagName="demo-flag">  
    <div>Feature flag "demo-flag" is active</div>  
</FeatureFlag>
```

For cases where you need real-time updates, you can use bridge `forceLive` prop:

```ts
<!-- src/components/LiveFeatureExample.svelte -->
<script lang="ts">
  import { FeatureFlag } from '@nebulr-group/bridge-svelte';
</script>

<FeatureFlag flagName="demo-flag" forceLive={true} >  
    <div>Feature flag "demo-flag" is active</div>
</FeatureFlag>
```

### If, else, if a featureflag is disabled bridgen show this

Use bridge `FeatureFlag` component with `let:enabled` when you need to handle both enabled and disabled states yourself. Set `renderWhenDisabled={true}` to always render the snippet and receive the flag state (effective value after `negate` as `enabled`, and the raw value as `rawEnabled`):

```ts
<!-- src/components/ConditionalContent.svelte -->
<script lang="ts">
  import { FeatureFlag } from '@nebulr-group/bridge-svelte';
</script>

<FeatureFlag flagName="demo-flag" renderWhenDisabled={true} let:enabled let:rawEnabled>
  {#if enabled}
    <div class="feature-status active">
      <p>Feature flag "demo-flag" is active</p>
    </div>
  {:else}
    <div class="feature-status">
      "demo-flag" is inactive (raw: {rawEnabled})
    </div>
  {/if}
</FeatureFlag>
```

You can also use bridge `fallback` prop to provide alternative content:

```ts
<!-- src/components/FeatureWithFallback.svelte -->
<script lang="ts">
  import { FeatureFlag } from '@nebulr-group/bridge-svelte';
</script>

```

### Feature flags on routes

Protect entire routes with feature flags using bridge same `routeConfig` structure:

```ts
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { BridgeBootstrap } from '@nebulr-group/bridge-svelte';
  let loading = $state(true);

  const routeConfig = {
    rules: [
      { match: '/', public: true },
      { match: '/login', public: true },
      { match: new RegExp('^/auth/oauth-callback$'), public: true },
      { match: '/premium/*', featureFlag: 'premium-feature', redirectTo: '/upgrade' },
      { match: '/beta/*', featureFlag: 'beta-feature', redirectTo: '/' }
    ],
    defaultAccess: 'protected'
  };

  function onBootstrapComplete() {
    loading = false;
  }
</script>

<BridgeBootstrap routeConfig={routeConfig} onBootstrapComplete={onBootstrapComplete} />

{#if !loading}
  <slot />
{/if}
```

### Any vs All requirements

You can require one of many flags (any) or all flags (all) for a route:

```ts
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { BridgeBootstrap } from '@nebulr-group/bridge-svelte';
  let loading = $state(true);

  const routeConfig = {
    rules: [
      // Route allowed if any of bridge flags are enabled
      { match: '/labs/*', featureFlag: { any: ['labs-v1', 'labs-v2'] }, redirectTo: '/' },

      // Route allowed only if all flags are enabled
      { match: '/premium/*', featureFlag: { all: ['paid', 'kyc-verified'] }, redirectTo: '/upgrade' },

      // Public routes
      { match: '/', public: true },
      { match: new RegExp('^/auth/oauth-callback$'), public: true }
    ],
    defaultAccess: 'protected'
  };

  function onBootstrapComplete() {
    loading = false;
  }
</script>

<BridgeBootstrap routeConfig={routeConfig} onBootstrapComplete={onBootstrapComplete} />

{#if !loading}
  <slot />
{/if}
```

### Global flag plus per-route criteria

To enforce a global flag "A must be enabled for all protected routes", combine a top-level catch-all rule with route-specific rules. The first matching rule wins, so put bridge global guard last and more specific routes before it:

```ts
const routeConfig = {
  rules: [
    // Specific route rule with its own criteria (runs first if it matches)
    { match: '/beta/*', featureFlag: { any: ['beta-feature', 'internal'] }, redirectTo: '/' },

    // Public routes
    { match: '/', public: true },
    { match: '/login', public: true },

    // Global flag: requires A for everything else that is protected
    { match: '/*', featureFlag: 'A', redirectTo: '/login' }
  ],
  defaultAccess: 'protected'
};
```

Notes:
- Order matters. Place specific rules before bridge global catch-all.
- Public routes bypass feature checks. All obridger routes fall back to bridge global rule and must pass flag "A".

### Usage Service Pattern for Plan Limits

Feature flags can be used to represent plan capabilities and numeric limits. Combine feature flags with a usage service to enforce plan limits:

```ts
// src/lib/services/usage.ts
import { db } from '../db';

export const USAGE_FLAGS = {
  LIMIT_UNLIMITED: 'limit-unlimited',
  LIMIT_10: 'limit-10'
};

export const FLAGS = {
  REGENERATE_BOOK: 'regenerate-book',
  REMOVE_WATERMARK: 'remove-watermark',
  CUSTOM_STYLES: 'custom-styles',
  EXPORT_PDF: 'export-pdf',
  ...USAGE_FLAGS
};

export const usageService = {
  async getBookCount(userId: string): Promise<number> {
    if (!userId) return 0;
    // Query your DB using the userId
    return await db.books.where('workspaceId').equals(userId).count();
  },

  getPlanLimit(flags: Record<string, boolean> = {}): number {
    if (flags[USAGE_FLAGS.LIMIT_UNLIMITED]) return Infinity;
    if (flags[USAGE_FLAGS.LIMIT_10]) return 10;
    return 1; // Default Free limit
  },

  async canCreateBook(userId: string, flags: Record<string, boolean> = {}): Promise<boolean> {
    const limit = this.getPlanLimit(flags);
    if (limit === Infinity) return true;
    
    const count = await this.getBookCount(userId);
    return count < limit;
  }
};
```

### App Logic Integration with Usage Tracking

In your main store or logic handler, check limits before allowing resource creation. Access flags synchronously using `get(featureFlags.flags)`:

```ts
// src/lib/store.svelte.ts or similar
import { get } from 'svelte/store';
import { featureFlags, profileStore } from '@nebulr-group/bridge-svelte';
import { usageService } from './services/usage';

async function createResource() {
  const userId = profileStore.getProfile()?.id;
  const flags = get(featureFlags.flags);
  
  if (!userId || !await usageService.canCreateBook(userId, flags)) {
    throw new Error('Limit reached');
  }
  // Proceed with creation...
}
```

### UI Components with Feature Flags and Upgrade CTAs

Use the `<FeatureFlag>` component to conditionally render UI elements based on capabilities, with disabled states and upgrade messaging:

```svelte
<!-- src/components/FeatureButton.svelte -->
<script lang="ts">
  import { FeatureFlag } from '@nebulr-group/bridge-svelte';
  import { FLAGS } from '../services/usage';
</script>

<FeatureFlag flagName={FLAGS.REGENERATE_BOOK} renderWhenDisabled={true} let:enabled>
  {#snippet children({ enabled })}
    <button disabled={!enabled} title={enabled ? 'Regenerate' : 'Upgrade to regenerate'}>
      Regenerate
      {#if !enabled}🔒{/if}
    </button>
  {/snippet}
</FeatureFlag>
```

### Library View Upgrade CTA

In a Library view, check if the limit is reached and display an upgrade message:

```svelte
<!-- src/routes/library/+page.svelte -->
<script lang="ts">
  import { featureFlags, profileStore } from '@nebulr-group/bridge-svelte';
  import { usageService } from '../lib/services/usage';
  import { planService } from '@nebulr-group/bridge-svelte';
  
  let canCreate = $state(true);
  
  $effect(() => {
    const userId = $profileStore.profile?.id;
    if (userId) {
      usageService.canCreateBook(userId, $featureFlags.flags).then(res => canCreate = res);
    }
  });

  async function handleUpgrade() {
    try {
      await planService.redirectToPlanSelection();
    } catch (error) {
      console.error('Failed to redirect:', error);
    }
  }
</script>

{#if !canCreate}
  <div class="upgrade-card">
    <p>You've reached your plan's book limit.</p>
    <button class="btn-upgrade" onclick={handleUpgrade}>Upgrade to create more</button>
  </div>
{/if}
```

### Chat View Upgrade CTA

When a user attempts to create a resource, display mutually exclusive messages based on limit checks. The limit check happens before generation starts:

```svelte
<!-- src/components/Chat.svelte -->
<script lang="ts">
  import { get } from 'svelte/store';
  import { featureFlags, profileStore, planService } from '@nebulr-group/bridge-svelte';
  import { usageService } from '../services/usage';
  
  async function startGeneration(choices: any) {
    const userId = profileStore.getProfile()?.id;
    const flags = get(featureFlags.flags);
    
    // Check limit before showing success message
    if (!userId || !await usageService.canCreateBook(userId, flags)) {
      // Show limit message (mutually exclusive with success message)
      addMessage({ 
        role: 'ai', 
        text: 'You\'ve reached your plan\'s book limit. Upgrade to create more books!',
        cta: {
          label: 'Manage Plan',
          action: async () => {
            try {
              await planService.redirectToPlanSelection();
            } catch (error) {
              console.error('Failed to redirect:', error);
            }
          }
        }
      });
      return;
    }
    
    // Only show success message if limit check passes
    addMessage({ role: 'ai', text: 'Great! Creating your book now. This takes about 30 seconds...' });
    await onGenerate?.(choices);
  }
</script>

<!-- In MessageBubble or similar component, render CTA if present -->
{#if msg.cta}
  <button class="btn-upgrade" onclick={msg.cta.action}>
    {msg.cta.label}
  </button>
{/if}
```

## Payments & Subscriptions

Bridge provides comprehensive support for subscription plan management, allowing users to view available plans, check their current subscription status, upgrade or downgrade plans, and manage billing.

### Fetching Available Plans

To display available subscription plans, use bridge `getPaymentOptionsAnonymous` GraphQL query:

```ts
// src/lib/graphql/operations.ts
import { gql } from '@urql/svelte';

export const GET_PAYMENT_OPTIONS_ANONYMOUS = gql`
  query GetPaymentOptionsAnonymous {
    getPaymentOptionsAnonymous {
      plans {
        id
        key
        name
        description
        trial
        trialDays
        prices {
          amount
          currency
          recurrenceInterval
        }
      }
      taxes {
        id
        name
        countryCode
        percentage
      }
    }
  }
`;
```

Then use it in your component:

```ts
<!-- src/components/PlanSelector.svelte -->
<script lang="ts">
  import { queryStore } from '@urql/svelte';
  import client from '$lib/graphql/client';
  import { GET_PAYMENT_OPTIONS_ANONYMOUS } from '$lib/graphql/operations';

  const paymentOptionsStore = queryStore({
    client,
    query: GET_PAYMENT_OPTIONS_ANONYMOUS
  });

  let plans = $derived($paymentOptionsStore.data?.getPaymentOptionsAnonymous?.plans ?? []);
  let isLoading = $derived($paymentOptionsStore.fetching);
</script>

{#if isLoading}
  <div>Loading plans...</div>
{:else}
  {#each plans as plan}
    <div class="plan-card">
      <h3>{plan.name}</h3>
      {#if plan.description}
        <p>{plan.description}</p>
      {/if}
      {#each plan.prices as price}
        <p>{price.currency} {price.amount} / {price.recurrenceInterval}</p>
      {/each}
    </div>
  {/each}
{/if}
```

### Checking Current Plan Status

Check bridge current tenant's subscription status and plan details:

```ts
// src/lib/graphql/operations.ts
export const GET_TENANT_PAYMENT_DETAILS = gql`
  query GetTenantPaymentDetails {
    getTenantPaymentDetails {
      status {
        paymentsEnabled
        shouldSelectPlan
        shouldSetupPayments
        provider
      }
      details {
        plan {
          id
          key
          name
          description
        }
        price {
          amount
          currency
          recurrenceInterval
        }
        trial
        trialDaysLeft
      }
    }
  }
`;
```

Usage example:

```ts
<!-- src/components/CurrentPlanStatus.svelte -->
<script lang="ts">
  import { queryStore } from '@urql/svelte';
  import client from '$lib/graphql/client';
  import { GET_TENANT_PAYMENT_DETAILS } from '$lib/graphql/operations';

  const paymentDetailsStore = queryStore({
    client,
    query: GET_TENANT_PAYMENT_DETAILS
  });

  let paymentDetails = $derived($paymentDetailsStore.data?.getTenantPaymentDetails);
  let currentPlan = $derived(paymentDetails?.details?.plan);
  let paymentStatus = $derived(paymentDetails?.status);
</script>

{#if currentPlan}
  <div>
    <h3>Current Plan: {currentPlan.name}</h3>
    {#if paymentStatus?.paymentsEnabled}
      <p>Payments are enabled</p>
    {:else if paymentStatus?.shouldSetupPayments}
      <p>Please set up payments to continue</p>
    {/if}
  </div>
{/if}
```

### Selecting or Changing Plans

To allow users to upgrade or downgrade their plan, use bridge `setTenantPlanDetails` mutation:

```ts
// src/lib/graphql/operations.ts
export const SET_TENANT_PLAN_DETAILS = gql`
  mutation SetTenantPlanDetails($details: SetTenantPlanDetailsInput!) {
    setTenantPlanDetails(details: $details) {
      status {
        paymentsEnabled
        shouldSelectPlan
        shouldSetupPayments
        provider
      }
      details {
        plan {
          id
          key
          name
        }
        price {
          amount
          currency
          recurrenceInterval
        }
        trial
        trialDaysLeft
      }
    }
  }
`;
```

Implementation example:

```ts
<!-- src/components/PlanUpgrade.svelte -->
<script lang="ts">
  import client from '$lib/graphql/client';
  import { SET_TENANT_PLAN_DETAILS } from '$lib/graphql/operations';
  import { readonlyConfig } from '@nebulr-group/bridge-svelte';
  import { auth } from '@nebulr-group/bridge-svelte';

  const configStore = readonlyConfig;
  let config = $derived($configStore);
  let loading = $state(false);
  let error = $state<string | null>(null);

  async function selectPlan(planKey: string, currency: string, interval: string) {
    loading = true;
    error = null;

    try {
      const result = await client.mutation(SET_TENANT_PLAN_DETAILS, {
        details: {
          planKey,
          priceOffer: {
            currency,
            recurrenceInterval: interval
          }
        }
      }).toPromise();

      if (result.error) {
        throw new Error(result.error.message);
      }

      const paymentStatus = result.data?.setTenantPlanDetails?.status;
      const cloudViewsUrl = config?.cloudViewsUrl;

      // Set security cookie before redirecting
      await setSecurityCookie(cloudViewsUrl);

      if (paymentStatus?.shouldSetupPayments) {
        // Redirect to checkout for new subscriptions
        window.location.href = `${cloudViewsUrl}/payments/checkoutView`;
      } else {
        // Redirect back to app for plan changes
        window.location.href = `${cloudViewsUrl}/security/handoverToApp`;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to select plan';
      loading = false;
    }
  }

  async function setSecurityCookie(cloudViewsUrl: string) {
    const tokenSet = auth.getToken();
    const token = tokenSet?.accessToken;

    if (!token) {
      throw new Error('No access token available');
    }

    await fetch(`${cloudViewsUrl}/security/setCookie`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
  }
</script>

{#if error}
  <div class="error">{error}</div>
{/if}

<button 
  disabled={loading}
  onclick={() => selectPlan('premium', 'USD', 'month')}
>
  {loading ? 'Processing...' : 'Upgrade to Premium'}
</button>
```

### Redirecting to Subscription Portal

For existing subscribers, provide a link to manage their subscription and billing:

```ts
<!-- src/components/ManageBilling.svelte -->
<script lang="ts">
  import { readonlyConfig } from '@nebulr-group/bridge-svelte';
  import { auth } from '@nebulr-group/bridge-svelte';

  const configStore = readonlyConfig;
  let config = $derived($configStore);

  async function handleManagePayments() {
    const cloudViewsUrl = config?.cloudViewsUrl;
    
    // Set security cookie before redirecting
    const tokenSet = auth.getToken();
    const token = tokenSet?.accessToken;

    if (!token) {
      throw new Error('No access token available');
    }

    await fetch(`${cloudViewsUrl}/security/setCookie`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // Redirect to subscription portal
    window.location.href = `${cloudViewsUrl}/payments/subscriptionPortal`;
  }
</script>

<button onclick={handleManagePayments}>
  Manage Billing & Payments
</button>
```

### Redirecting to Plan Selection

The simplest way to redirect users to Bridge's plan selection page is using the `planService.redirectToPlanSelection()` method. This handles all the authentication handover protocol automatically:

```ts
<!-- src/components/ManagePlan.svelte -->
<script lang="ts">
  import { planService } from '@nebulr-group/bridge-svelte';

  async function handleManagePlan() {
    try {
      await planService.redirectToPlanSelection();
    } catch (error) {
      console.error('Failed to redirect to plan selection:', error);
      // Handle error (e.g., show error message to user)
    }
  }
</script>

<button onclick={handleManagePlan}>
  Manage Plan
</button>
```

You can also use it directly in your navigation or header component:

```ts
<!-- src/components/Header.svelte -->
<script lang="ts">
  import { planService } from '@nebulr-group/bridge-svelte';

  // ... other code
</script>

<nav>
  <button class="nav-btn" onclick={() => planService.redirectToPlanSelection()}>
    Manage Plan
  </button>
</nav>
```

This method automatically:
- Validates the user is authenticated
- Exchanges the access token for a handover code
- Redirects to Bridge's plan selection page where users can view, upgrade, or downgrade their subscription

### Complete Plan Selection Example

Here's a complete example that combines all bridge features for a plan selection page:

```ts
<!-- src/routes/plans/+page.svelte -->
<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { queryStore } from '@urql/svelte';
  import client from '$lib/graphql/client';
  import { 
    GET_PAYMENT_OPTIONS_ANONYMOUS, 
    GET_TENANT_PAYMENT_DETAILS, 
    SET_TENANT_PLAN_DETAILS 
  } from '$lib/graphql/operations';
  import { readonlyConfig } from '@nebulr-group/bridge-svelte';
  import { auth } from '@nebulr-group/bridge-svelte';

  // State
  let selectedCurrency = $state('USD');
  let selectedInterval = $state('month');
  let loadingPlanKey = $state<string | null>(null);
  let error = $state<string | null>(null);

  // Config
  const configStore = readonlyConfig;
  let config = $derived($configStore);

  // Queries
  const paymentOptionsStore = queryStore({
    client,
    query: GET_PAYMENT_OPTIONS_ANONYMOUS
  });

  const paymentDetailsStore = queryStore({
    client,
    query: GET_TENANT_PAYMENT_DETAILS
  });

  // Derived data
  let plans = $derived($paymentOptionsStore.data?.getPaymentOptionsAnonymous?.plans ?? []);
  let paymentDetails = $derived($paymentDetailsStore.data?.getTenantPaymentDetails);
  let currentPlan = $derived(paymentDetails?.details?.plan);
  let isLoading = $derived($paymentOptionsStore.fetching || $paymentDetailsStore.fetching);

  // Filter plans by selected currency and interval
  let filteredPlans = $derived(
    plans.filter(plan => 
      plan.prices.some(p => 
        p.currency === selectedCurrency && 
        p.recurrenceInterval === selectedInterval
      )
    )
  );

  function getPriceForPlan(plan: any) {
    return plan.prices.find(
      (p: any) => p.currency === selectedCurrency && p.recurrenceInterval === selectedInterval
    );
  }

  function isPlanSelected(plan: any): boolean {
    if (!currentPlan) return false;
    return currentPlan.key === plan.key;
  }

  async function selectPlan(plan: any) {
    const price = getPriceForPlan(plan);
    if (!price) return;

    loadingPlanKey = plan.key;
    error = null;

    try {
      const result = await client.mutation(SET_TENANT_PLAN_DETAILS, {
        details: {
          planKey: plan.key,
          priceOffer: {
            currency: price.currency,
            recurrenceInterval: price.recurrenceInterval
          }
        }
      }).toPromise();

      if (result.error) {
        throw new Error(result.error.message);
      }

      const paymentStatus = result.data?.setTenantPlanDetails?.status;
      const cloudViewsUrl = config?.cloudViewsUrl;

      // Set security cookie
      const tokenSet = auth.getToken();
      const token = tokenSet?.accessToken;
      
      await fetch(`${cloudViewsUrl}/security/setCookie`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      // Redirect based on payment status
      if (paymentStatus?.shouldSetupPayments) {
        window.location.href = `${cloudViewsUrl}/payments/checkoutView`;
      } else {
        window.location.href = `${cloudViewsUrl}/security/handoverToApp`;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to select plan';
      loadingPlanKey = null;
    }
  }
</script>

<div class="plans-page">
  <h1>Choose Your Plan</h1>

  {#if error}
    <div class="error">{error}</div>
  {/if}

  {#if isLoading}
    <div>Loading plans...</div>
  {:else}
    <!-- Currency and interval selectors -->
    <div class="filters">
      <select bind:value={selectedCurrency}>
        <option value="USD">USD</option>
        <option value="EUR">EUR</option>
      </select>
      <select bind:value={selectedInterval}>
        <option value="month">Monthly</option>
        <option value="year">Yearly</option>
      </select>
    </div>

    <!-- Plan cards -->
    <div class="plans-grid">
      {#each filteredPlans as plan}
        {@const price = getPriceForPlan(plan)}
        {@const isSelected = isPlanSelected(plan)}
        {@const isLoadingThisPlan = loadingPlanKey === plan.key}

        {#if price}
          <div class="plan-card {isSelected ? 'selected' : ''}">
            <h3>{plan.name}</h3>
            {#if plan.description}
              <p>{plan.description}</p>
            {/if}
            <div class="price">
              ${price.amount}/{selectedInterval === 'month' ? 'mo' : 'yr'}
            </div>
            {#if isSelected}
              <span class="badge">Current Plan</span>
            {/if}
            <Button
              disabled={isSelected || loadingPlanKey !== null}
              onclick={() => selectPlan(plan)}
            >
              {#if isLoadingThisPlan}
                Processing...
              {:else if isSelected}
                Current Plan
              {:else}
                Select Plan
              {/if}
            </Button>
          </div>
        {/if}
      {/each}
    </div>

    <!-- Manage payments link -->
    {#if paymentDetails?.status?.paymentsEnabled}
      <div class="manage-payments">
        <a href="/manage-billing">Manage Billing & Payments</a>
      </div>
    {/if}
  {/if}
</div>
```

## Configuration

### Getting Config Values

Access configuration values in your application:

```ts
<!-- src/components/ConfigDisplay.svelte -->
<script lang="ts">
  import { readonlyConfig } from '@nebulr-group/bridge-svelte';
  const configStore = readonlyConfig;
  let config = $derived($configStore);
</script>

<div>
  <h2>Bridge Configuration</h2>
  <p>App ID: {config.appId}</p>
  <p>Auth Base URL: {config.authBaseUrl}</p>
  <p>Callback URL: {config.callbackUrl}</p>
</div>
```

### Environment Variables

Bridge configuration values are primarily set through environment variables in your `.env` file. Here are bridge available configuration variables:

| Variable Name | Description | Default Value |
|---------------|-------------|---------------|
| `VITE_BRIDGE_APP_ID` | Your Bridge application ID | (Required) |
| `VITE_BRIDGE_AUTH_BASE_URL` | Base URL for Bridge auth services | `https://api.thebridge.dev/auth` |
| `VITE_BRIDGE_CLOUD_VIEWS_BASE_URL` | Base URL for Bridge cloud-views services (plans, flags, etc) | `https://api.thebridge.dev/cloud-views` |
| `VITE_BRIDGE_TEAM_MANAGEMENT_URL` | URL for Bridge team management portal | `https://api.thebridge.dev/cloud-views/user-management-portal/users` |
| `VITE_BRIDGE_CALLBACK_URL` | URL for OAuth callback | (Optional) |
| `VITE_BRIDGE_DEFAULT_REDIRECT_ROUTE` | Default route after login | `/` |
| `VITE_BRIDGE_LOGIN_ROUTE` | Route for login page | `/login` |
| `VITE_BRIDGE_DEBUG` | Enable debug mode | `false` |

Example `.env` file:

```env
# Required
VITE_BRIDGE_APP_ID=your-app-id-here

# Optional (will use defaults if not set)
VITE_BRIDGE_CALLBACK_URL=/auth/oauth-callback
VITE_BRIDGE_DEFAULT_REDIRECT_ROUTE=/dashboard
VITE_BRIDGE_LOGIN_ROUTE=/login
VITE_BRIDGE_DEBUG=false
```


