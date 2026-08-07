<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/stores';
  import { isAuthenticated, getBridgeAuth } from '@bridge-svelte/lib/core/bridge-instance';
  import { getConfig } from '@bridge-svelte/lib/client/stores/config.store';
  import { stylesToggle } from '$lib/styles-toggle.svelte.js';
  import { demoState, PERSONAS } from '$lib/demo/demo-state.svelte.js';
  import { inspector } from '$lib/demo/inspector.svelte.js';
  import Inspector from './Inspector.svelte';

  let { children }: { children: Snippet } = $props();

  type NavItem = { href: string; label: string };
  type NavGroup = { group: string; items: NavItem[] };

  // Domain-grouped navigation. Each entry is a real SvelteKit route so links
  // deep-link, the GitLab reference stays browsable, and E2E keeps working.
  const NAV: NavGroup[] = [
    { group: 'Overview', items: [{ href: '/', label: 'Home' }] },
    {
      group: 'Authentication',
      items: [
        { href: '/auth/login', label: 'Login' },
        { href: '/auth/signup', label: 'Signup' },
        { href: '/auth/magic-link', label: 'Magic link' },
        { href: '/auth/forgot-password', label: 'Forgot password' },
        { href: '/sso', label: 'SSO' },
        { href: '/mfa', label: 'MFA' },
        { href: '/protected', label: 'Protected Page' },
      ],
    },
    {
      group: 'Feature flags',
      items: [
        { href: '/flag-demo', label: 'Feature Flags' },
        { href: '/rollout', label: 'Percentage rollout' },
      ],
    },
    {
      group: 'Team & tenancy',
      items: [
        { href: '/team-panel', label: 'Team Management' },
        { href: '/workspaces', label: 'Workspaces' },
        { href: '/api-tokens', label: 'API tokens' },
      ],
    },
    {
      group: 'Billing',
      items: [
        { href: '/subscription', label: 'Subscription' },
        { href: '/billing-lifecycle', label: 'Billing Lifecycle' },
        { href: '/paywall', label: 'Paywall' },
      ],
    },
    { group: 'Branding', items: [{ href: '/branding', label: 'Branding' }] },
  ];

  let sidebarOpen = $state(false);

  const env = (import.meta.env.VITE_ENVIRONMENT as string) || 'local';

  function isActive(href: string, path: string): boolean {
    return href === '/' ? path === '/' : path === href || path.startsWith(href + '/');
  }

  function handleLogout() {
    getBridgeAuth().logout({ redirectTo: getConfig().loginRoute });
  }
</script>

<div class="shell">
  <!-- TOPBAR -->
  <header class="topbar">
    <button
      class="hamburger"
      aria-label="Toggle navigation"
      onclick={() => (sidebarOpen = !sidebarOpen)}>☰</button
    >
    <a href="/" class="nav-brand">
      <span class="brand-mark">▚</span> Bridge Demo
    </a>
    <span class="env-pill" data-env={env}>{env}</span>

    <div class="topbar-spacer"></div>

    <!-- Persona switcher — publishes app.persona to the flag pipeline -->
    <label class="persona" title="Demo persona — published as the app.persona flag attribute">
      <span class="persona-label">Persona</span>
      <select
        data-testid="persona-select"
        value={demoState.personaId}
        onchange={(e) => demoState.setPersona((e.currentTarget as HTMLSelectElement).value)}
      >
        {#each PERSONAS as p (p.id)}
          <option value={p.id}>{p.label}</option>
        {/each}
      </select>
    </label>

    <button
      class="icon-btn"
      title="Toggle Bridge component styles"
      onclick={() => stylesToggle.toggle()}
    >
      {stylesToggle.enabled ? '🎨' : '⬜'}
    </button>

    <button
      class="icon-btn"
      title="Toggle light / dark theme"
      data-testid="theme-toggle"
      onclick={() => demoState.toggleTheme()}
    >
      {demoState.theme === 'dark' ? '☀' : '☾'}
    </button>

    <button
      class="icon-btn"
      class:active={inspector.open}
      title="Toggle the Under-the-hood inspector"
      data-testid="inspector-toggle"
      onclick={() => inspector.toggle()}
    >
      ⚡{inspector.events.length > 0 ? ` ${inspector.events.length}` : ''}
    </button>

    {#if $isAuthenticated}
      <button class="nav-button" onclick={handleLogout}>Logout</button>
    {:else}
      <a href="/auth/login" class="nav-link nav-link--login">Login</a>
    {/if}
  </header>

  <div class="body">
    <!-- SIDEBAR -->
    <nav class="sidebar" class:open={sidebarOpen} aria-label="Feature navigation">
      {#each NAV as g (g.group)}
        <div class="nav-group">
          <div class="nav-group-label">{g.group}</div>
          {#each g.items as item (item.href)}
            <a
              href={item.href}
              class="nav-link"
              class:active={isActive(item.href, $page.url.pathname)}
              onclick={() => (sidebarOpen = false)}
            >
              {item.label}
            </a>
          {/each}
        </div>
      {/each}
    </nav>

    <!-- backdrop for mobile drawer -->
    {#if sidebarOpen}
      <button class="backdrop" aria-label="Close navigation" onclick={() => (sidebarOpen = false)}
      ></button>
    {/if}

    <!-- CONTENT -->
    <main class="content">
      {@render children()}
    </main>

    <!-- INSPECTOR (docked rail) -->
    {#if inspector.open}
      <Inspector />
    {/if}
  </div>
</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--shell-bg);
    color: var(--text);
  }

  .topbar {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 56px;
    flex: none;
    padding: 0 16px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    z-index: 30;
  }
  .hamburger {
    display: none;
    background: none;
    border: none;
    color: var(--text);
    font-size: 18px;
    cursor: pointer;
  }
  .nav-brand {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--text);
    text-decoration: none;
  }
  .brand-mark {
    color: var(--primary);
    font-size: 17px;
  }
  .env-pill {
    font: 600 10px ui-monospace, monospace;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    background: var(--surface-2);
    border: 1px solid var(--border);
    padding: 3px 8px;
    border-radius: 20px;
  }
  .env-pill[data-env='prod'] {
    color: var(--danger);
    border-color: var(--danger);
  }
  .topbar-spacer {
    flex: 1;
  }

  .persona {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .persona-label {
    font: 600 10px ui-monospace, monospace;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-faint);
  }
  .persona select {
    height: 30px;
    padding: 0 8px;
    border: 1px solid var(--border-2);
    border-radius: 7px;
    background: var(--surface-2);
    color: var(--text);
    font: 600 12px Inter, sans-serif;
    cursor: pointer;
  }

  .icon-btn {
    height: 32px;
    min-width: 32px;
    padding: 0 8px;
    border: 1px solid var(--border-2);
    border-radius: 7px;
    background: var(--surface-2);
    color: var(--text);
    font-size: 13px;
    cursor: pointer;
  }
  .icon-btn:hover {
    border-color: var(--primary);
  }
  .icon-btn.active {
    border-color: var(--primary);
    color: var(--primary);
    background: var(--primary-soft);
  }

  .nav-button {
    height: 32px;
    padding: 0 14px;
    border: none;
    border-radius: 7px;
    background: var(--danger);
    color: #fff;
    font: 600 12.5px Inter, sans-serif;
    cursor: pointer;
  }
  .nav-button:hover {
    filter: brightness(0.94);
  }
  .nav-link--login {
    height: 32px;
    display: inline-flex;
    align-items: center;
    padding: 0 16px;
    border-radius: 7px;
    background: var(--primary);
    color: #fff;
    font: 600 12.5px Inter, sans-serif;
    text-decoration: none;
  }
  .nav-link--login:hover {
    filter: brightness(0.94);
  }

  .body {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .sidebar {
    width: 230px;
    flex: none;
    overflow-y: auto;
    padding: 16px 12px 32px;
    background: var(--surface);
    border-right: 1px solid var(--border);
  }
  .nav-group {
    margin-bottom: 18px;
  }
  .nav-group-label {
    font: 600 9.5px ui-monospace, monospace;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-faint);
    padding: 0 10px 6px;
  }
  .nav-link {
    display: block;
    padding: 7px 10px;
    border-radius: 7px;
    font-size: 13px;
    color: var(--text-muted);
    text-decoration: none;
    line-height: 1.3;
  }
  .nav-link:hover {
    background: var(--surface-2);
    color: var(--text);
  }
  .nav-link.active {
    background: var(--primary-soft);
    color: var(--primary);
    font-weight: 600;
  }

  .backdrop {
    display: none;
  }

  .content {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
  }

  /* ── Responsive: sidebar → drawer, inspector handled by AppShell toggle ── */
  @media (max-width: 900px) {
    .hamburger {
      display: inline-block;
    }
    .persona-label {
      display: none;
    }
    .sidebar {
      position: fixed;
      top: 56px;
      bottom: 0;
      left: 0;
      z-index: 40;
      transform: translateX(-100%);
      transition: transform 0.18s ease;
      box-shadow: var(--shadow-2);
    }
    .sidebar.open {
      transform: translateX(0);
    }
    .backdrop {
      display: block;
      position: fixed;
      inset: 56px 0 0 0;
      z-index: 35;
      background: rgba(0, 0, 0, 0.4);
      border: none;
    }
  }
</style>
