// Core stores and setup
export * from './client/BridgeBootstrap.js';
export * from './client/stores/config.store.js';

// Bridge instance (singleton + Svelte stores)
export {
  initBridge,
  getBridgeAuth,
  markReady,
  waitForBridge,
  auth,
  tokenStore,
  isAuthenticated,
  isLoading,
  authError,
  authState,
  isOnboarded,
  hasMultiTenantAccess,
  tenantUsersStore,
  profileStore,
  flagsStore,
  bridgeReadyStore,
  appConfigStore,
  ensureAppConfig,
  subscriptionStore,
  loadSubscription,
} from './core/bridge-instance.js';

// Components (Svelte components must have `export default`)
export { default as BridgeBootstrap, default as BridgeProvider } from './client/BridgeBootstrap.svelte';
export { default as ApiTokenManagement } from './client/components/developer/ApiTokenManagement.svelte';
export { default as FeatureFlag } from './client/components/FeatureFlag.svelte';
export { default as ProfileName } from './client/components/ProfileName.svelte';
export { default as TeamManagementPanel } from './client/components/team/TeamManagementPanel.svelte';
export { default as TeamUserList } from './client/components/team/TeamUserList.svelte';
export { default as TeamProfileForm } from './client/components/team/TeamProfileForm.svelte';
export { default as TeamWorkspaceForm } from './client/components/team/TeamWorkspaceForm.svelte';

// SDK Auth Components
export { default as LoginForm } from './client/components/sdk-auth/LoginForm.svelte';
export { default as MfaChallenge } from './client/components/sdk-auth/MfaChallenge.svelte';
export { default as MfaSetup } from './client/components/sdk-auth/MfaSetup.svelte';
export { default as TenantSelector } from './client/components/sdk-auth/TenantSelector.svelte';
export { default as WorkspaceSelector } from './client/components/sdk-auth/WorkspaceSelector.svelte';
export { default as SsoButton } from './client/components/sdk-auth/SsoButton.svelte';
export { default as SignupForm } from './client/components/sdk-auth/SignupForm.svelte';
export { default as ForgotPassword } from './client/components/sdk-auth/ForgotPassword.svelte';
export { default as MagicLink } from './client/components/sdk-auth/MagicLink.svelte';
export { default as PasskeyLogin } from './client/components/sdk-auth/PasskeyLogin.svelte';
export { default as PasskeyRequestSetupLink } from './client/components/sdk-auth/PasskeyRequestSetupLink.svelte';
export { default as PasskeySetup } from './client/components/sdk-auth/PasskeySetup.svelte';

// Subscription components
export { default as PlanSelector } from './client/components/subscription/PlanSelector.svelte';

// Feature flags
export * from './shared/feature-flag.js';

// Auth route guards
export * from './auth/route-guard.js';

// Types
export * from './shared/profile.js';
export * from './shared/types/config.js';

// Logger
export { logger, setLoggerDebug } from './shared/logger.js';

// Conversion tracking (Reddit / GA4 via GTM dataLayer)
export {
	pushConversionEvent,
	pushRedditEvent,
	configureRedditTracking,
} from './client/tracking/reddit-tracking.js';
export type {
	RedditConversionEvent,
	RedditEcommerce,
	RedditEcommerceItem,
	RedditUserData,
	PushConversionEventOptions,
	RedditTrackingGate,
} from './client/tracking/reddit-tracking.js';
export { sha256Email } from './client/tracking/pii-hashing.js';

// Auth-core type re-exports for advanced consumers
export type {
  AuthConfigResponse,
  AuthResult,
  AuthState,
  BridgeAuthConfig,
  BridgeAuthEventName,
  BridgeAuthEvents,
  FederationConnection,
  MagicLinkResult,
  MfaResult,
  PasskeyAuthOptions,
  PasskeyRegistrationOptions,
  PasskeyVerificationResult,
  SignupResult,
  SsoOptions,
  SsoResult,
  TenantUser,
} from '@nebulr-group/bridge-auth-core';
export { BridgeAuth, BridgeAuthError, HttpError, TeamService, ApiTokenService } from '@nebulr-group/bridge-auth-core';
export type {
  ApiToken,
  CreateApiTokenInput,
  CreateApiTokenResponse,
} from '@nebulr-group/bridge-auth-core';
export type {
  TeamProfile,
  TeamProfileUpdateInput,
  TeamUser,
  TeamUserListResult,
  TeamUserUpdateInput,
  TeamWorkspace,
  TeamWorkspaceUpdateInput,
} from '@nebulr-group/bridge-auth-core';
export type {
  Plan,
  PriceOfferSdk,
  SubscriptionStatus,
  CheckoutSession,
  Workspace,
} from '@nebulr-group/bridge-auth-core';
