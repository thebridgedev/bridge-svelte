/**
 * @nebulr-group/bridge-svelte
 *
 * The Bridge for SvelteKit: sign-in in your own pages, workspaces, flags and
 * route guards, plans and checkout, the team panel and Live updates, on one
 * setting, the issuer. Server helpers are in `@nebulr-group/bridge-svelte/server`,
 * the default look in `@nebulr-group/bridge-svelte/styles`.
 */

// Setting up
export { bridgeBootstrap, FLAGS_DEPENDENCY, SESSION_DEPENDENCY } from './bootstrap.js';
export type { BridgeLayoutData, BridgeLoadEvent } from './bootstrap.js';
export type { BridgeConfig, BridgeMessages, FlagRequirement, ResolvedConfig, RouteRule } from './core/config.js';
export { bridgeClient, bridgeConfig, getBridge, getConfig } from './core/client.js';
export { AUTH_PAGES, BILLING_PAGES } from './core/routes.js';
export type { AuthPage, BillingPage } from './core/routes.js';
export { decide, findRule, flagsAllow } from './core/guard.js';
export type { GuardDecision, GuardInput } from './core/guard.js';

// State
export { billing, flags, flagsStatus, liveStatus, me, plans, resource, session, signedIn, usage, user, workspace, workspaces } from './core/stores.js';
export type { Resource, ResourceStore } from './core/stores.js';

// Flags
export { canManageBilling, canManageTeam, flag, flagReason, requireFlag, useFlag } from './core/flags.js';

// Calling your API
export { bridgeFetch } from './core/fetch.js';
export { closeUpgrade, openUpgrade, readPaymentRequired, upgradeRequest } from './core/upgrade.js';
export type { UpgradeDialogProps, UpgradeRequest } from './core/upgrade.js';

// Hand-off mode
export { handoffSignIn, readHandoff, returnToProgram } from './core/handoff.js';
export type { HandoffState } from './core/handoff.js';

// Copy
export { errorMessage, translator } from './core/i18n.js';
export type { BridgeMessageKey, BridgeTranslator } from './core/i18n.js';
export type { PluginMessageKey } from './core/messages.js';

// The few auth-core names app code needs to use this package
export { BridgeError, isBridgeError, STANDARD_FLAGS } from '@nebulr-group/bridge-auth-core';
export type { Bridge, BridgeErrorKind, SessionState, SessionUser, SessionWorkspace } from '@nebulr-group/bridge-auth-core';

// Components
export { default as BridgeBootstrap } from './components/BridgeBootstrap.svelte';
export { default as BridgeAuthRoutes } from './components/auth/BridgeAuthRoutes.svelte';
export { default as SignInForm } from './components/auth/SignInForm.svelte';
export { default as SignUpForm } from './components/auth/SignUpForm.svelte';
export { default as VerifyEmail } from './components/auth/VerifyEmail.svelte';
export { default as MagicLinkLanding } from './components/auth/MagicLinkLanding.svelte';
export { default as PasskeySetupLanding } from './components/auth/PasskeySetupLanding.svelte';
export { default as PasskeyManager } from './components/auth/PasskeyManager.svelte';
export { default as ForgotPassword } from './components/auth/ForgotPassword.svelte';
export { default as SetPassword } from './components/auth/SetPassword.svelte';
export { default as InviteLanding } from './components/auth/InviteLanding.svelte';
export { default as WorkspaceChooser } from './components/auth/WorkspaceChooser.svelte';
export { default as HandoffSignIn } from './components/auth/HandoffSignIn.svelte';
export { default as SignOutButton } from './components/auth/SignOutButton.svelte';
export { default as ProfileName } from './components/auth/ProfileName.svelte';
export { default as FeatureFlag } from './components/flags/FeatureFlag.svelte';
export type { FeatureFlagOffInfo } from './components/flags/FeatureFlag.svelte';
export { default as UpgradeDialog } from './components/billing/UpgradeDialog.svelte';
export { default as LiveStatusBadge } from './components/live/LiveStatusBadge.svelte';
export { default as TeamPanel } from './components/team/TeamPanel.svelte';
export { default as MemberList } from './components/team/MemberList.svelte';
export { default as InviteList } from './components/team/InviteList.svelte';
export { default as InviteDialog } from './components/team/InviteDialog.svelte';
export { default as EditMemberDialog } from './components/team/EditMemberDialog.svelte';
export { default as ConfirmDialog } from './components/team/ConfirmDialog.svelte';
export { default as WorkspaceForm } from './components/team/WorkspaceForm.svelte';
export { default as ProfileForm } from './components/team/ProfileForm.svelte';
export { default as BridgeBillingRoutes } from './components/billing/BridgeBillingRoutes.svelte';
export { default as PlanPicker } from './components/billing/PlanPicker.svelte';
export { default as BillingPortalButton } from './components/billing/BillingPortalButton.svelte';
export { default as SubscriptionStatus } from './components/billing/SubscriptionStatus.svelte';
export { default as BillingNotice } from './components/billing/BillingNotice.svelte';
export { default as QuotaBanner } from './components/billing/QuotaBanner.svelte';
export { default as CheckoutNotice } from './components/billing/CheckoutNotice.svelte';
export { useQuota } from './components/billing/quota.js';
export type { Quota, QuotaState } from './components/billing/quota.js';
