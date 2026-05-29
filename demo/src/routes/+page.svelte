<script lang="ts">
  import ConfigStatus from '$lib/components/ConfigStatus.svelte';
  // FF 2.0 reactive component — re-renders live when flags change via realtime push
  import FeatureFlag from '@bridge-svelte/lib/flags/FeatureFlag.svelte';

  // Dev-supplied attributes for the second feature-flag example. Flipping any
  // of these re-runs the flag's rule against the new value (per-call attributes
  // win on collision with any Bridge-managed provider). They also get observed
  // by the SDK and pushed to the admin attribute catalog (TBP-178 discovery).
  let plan = $state<'enterprise' | 'pro' | 'free'>('enterprise');
  let country = $state<'SE' | 'US' | 'DE'>('SE');
  let beta_cohort = $state(true);
</script>

<div class="page-container">
  <div class="container">
    <div class="content">
      <div class="hero">
        <h1 class="heading-xl">Welcome to  Bridge Svelte Demo</h1>
        <p class="text-lead">
          This demo showcases bridge integration of Bridge features in a Svelte application.
        </p>
      </div>

      <ConfigStatus />
      <div class="features-overview">
        <h2 class="heading-lg">The code demonstrates bridge following features</h2>
        <div class="features-grid">
          <div class="feature-group">
            <h3 class="heading-md">🚦 Feature Flags</h3>
            <ul>
              <li>Basic feature flag usage</li>
              <li>Rule + dev-supplied attribute (per-call context)</li>
              <li>Negation support for inverse conditions</li>
              <li>Cached vs live flag checks</li>
              <li>Route protection with flags</li>
            </ul>
          </div>

          <div class="feature-group">
            <h3 class="heading-md">👥 Team Management</h3>
            <ul>
              <li><a href="/team-panel">Team Panel (Native SDK)</a></li>
              <li>Role management</li>
              <li>Invite system</li>
              <li>Permissions handling</li>
            </ul>
          </div>

          <div class="feature-group">
            <h3 class="heading-md">🔐 Authentication (OAuth Redirect)</h3>
            <ul>
              <li>Login & logout via hosted page</li>
              <li>Protected routes</li>
              <li>Automatic token renewal</li>
              <li>Profile information</li>
            </ul>
          </div>

          <div class="feature-group">
            <h3 class="heading-md">🔑 Authentication (SDK Auth)</h3>
            <ul>
              <li><a href="/auth/login">Login</a> — email, password, MFA, tenant</li>
              <li><a href="/auth/signup">Signup</a> — registration form</li>
              <li><a href="/auth/forgot-password">Forgot Password</a> — reset link</li>
              <li><a href="/auth/magic-link">Magic Link</a> — passwordless</li>
            </ul>
          </div>

          <div class="feature-group">
            <h3 class="heading-md">💳 Subscriptions</h3>
            <ul>
              <li><a href="/subscription">Plan Selector</a> — pick/change plan</li>
              <li>Free plan activation (no Stripe)</li>
              <li>Stripe Checkout for paid plans</li>
              <li>Billing portal redirect</li>
            </ul>
          </div>

          <div class="feature-group">
            <h3 class="heading-md">🛠️ Integration Examples</h3>
            <ul>
              <li>Conditional rendering</li>
              <li>Route guards</li>
              <li>State management</li>
              <li>Error handling</li>
            </ul>
          </div>
        </div>
      </div>

      <div class="feature-examples">
        <h2 class="heading-lg">Feature Flag Examples</h2>

        <div class="feature-examples-grid">
          <div class="feature-example">
            <h3 class="heading-md">Live Feature Flag (FF 2.0)</h3>
            <div class="card">
              <p class="note">Updates live via realtime push — no refresh needed</p>
              <FeatureFlag key="demo-flag-2" defaultValue={false}>
                {#snippet children(value)}
                  <div class="feature-status active">
                    <p>Feature flag "demo-flag" is active ✓</p>
                  </div>
                {/snippet}
                {#snippet fallback(value)}
                  <div class="feature-status">Create a feature flag called "demo-flag" and enable it</div>
                {/snippet}
              </FeatureFlag>
            </div>
          </div>

          <div class="feature-example">
            <h3 class="heading-md">Rule-based Flag + Dev Attribute (FF 2.0)</h3>
            <div class="card">
              <p class="note">
                Create a flag <code>enterprise-feature</code> with rule
                <code>plan is enterprise &rarr; true</code>. The select below feeds the
                dev-supplied <code>plan</code> attribute on each eval — per-call
                attributes win over Bridge-managed providers on key collision.
              </p>
              <label class="attr-control">
                <code>plan</code>:
                <select bind:value={plan} data-testid="plan-select">
                  <option value="enterprise">enterprise</option>
                  <option value="pro">pro</option>
                  <option value="free">free</option>
                </select>
              </label>
              <label class="attr-control">
                <code>country</code>:
                <select bind:value={country} data-testid="country-select">
                  <option value="SE">SE</option>
                  <option value="US">US</option>
                  <option value="DE">DE</option>
                </select>
              </label>
              <label class="attr-control">
                <code>beta_cohort</code>:
                <input type="checkbox" bind:checked={beta_cohort} data-testid="beta-cohort-checkbox" />
              </label>
              <FeatureFlag
                key="enterprise-feature"
                defaultValue={false}
                context={{ attributes: { plan, country, beta_cohort } }}
              >
                {#snippet children(_value)}
                  <div class="feature-status active" data-testid="enterprise-feature-state">
                    <p>"enterprise-feature" matched — rule says <code>plan is enterprise</code> ✓</p>
                  </div>
                {/snippet}
                {#snippet fallback(_value)}
                  <div class="feature-status" data-testid="enterprise-feature-state">
                    Rule did not match for <code>plan = {plan}</code>
                  </div>
                {/snippet}
              </FeatureFlag>
            </div>
          </div>
        </div>

        <div class="feature-examples-grid">
          <!-- <div class="feature-example">
            <h3 class="heading-md">Client-Side API Feature Flag</h3>
            <div class="card">
              <FeatureFlagAPIExample />
            </div>
          </div> -->

          <!-- <div class="feature-example">
            <h3 class="heading-md">Server-Side Feature Flag</h3>
            <div class="card">
              <p class="mb-4">
                Server-side feature flags are rendered on bridge server and cannot be directly embedded in client components.
                Click bridge link below to see bridge server-side feature flag example:
              </p>
              <a href="/server-feature-flag-example" class="nav-link">
                View Server-Side Feature Flag Example
              </a>
            </div>
          </div> -->
        </div>
      </div>      
    </div>
  </div>
</div>

