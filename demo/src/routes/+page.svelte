<script lang="ts">
  import ConfigStatus from '$lib/components/ConfigStatus.svelte';
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
              <li><a href="/flag-demo">Feature Flags demo</a> — simple, rule-based, client context</li>
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

    </div>
  </div>
</div>

