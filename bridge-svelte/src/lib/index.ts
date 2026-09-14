// Core stores and setup
export * from './client/BridgeBootstrap.js';
export * from './client/stores/config.store.js';

// Bridge instance (singleton accessors + reactive stores).
//
// `auth` is the recommended way to call BridgeAuth methods imperatively
// (it's a lazy proxy to the singleton — `auth.logout()`, `auth.signup()`,
// `auth.getProfile()`, etc.). The unified `bridge` surface below is the
// recommended way to *read* live state reactively.
export {
  initBridge,
  markReady,
  waitForBridge,
  getBridgeAuth,
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
  bridgeReadyStore,
  appConfigStore,
  ensureAppConfig,
  subscriptionStore,
  loadSubscription,
} from './core/bridge-instance.js';
export type { SubscriptionState } from './core/bridge-instance.js';

// Phase 4 (TBP-288/319) — unified read surface. Single `bridge` aggregate
// with scoped slices (`bridge.app` / `bridge.tenant` / `bridge.user`) fed
// by session.snapshot. Coexists with the legacy module-level stores above;
// `<BridgeProvider>` + `useBridge()` context hook land in TBP-320.
export { bridge } from './core/bridge.js';
export type {
  BridgeSurface,
  BridgeAppSurface,
  BridgeTenantSurface,
} from './core/bridge.js';
export type {
  BrandingSnapshot,
  SubscriptionSnapshot,
  UserSnapshot,
  SessionSnapshotData,
} from './core/snapshot-stores.js';

// Phase 5 (TBP-331) — bridge.events.handle() handler-table type + dispatcher
// type (the type of `bridge.events`, for consumers typing a reference to it).
export type { BridgeEventHandlers, BridgeEventsDispatcher } from './core/events.js';

// Components (Svelte components must have `export default`)
export { default as BridgeBootstrap, default as BridgeProvider } from './client/BridgeBootstrap.svelte';
export { default as ApiTokenManagement } from './client/components/developer/ApiTokenManagement.svelte';
// TBP-644 — dev-only live-updates badge. <BridgeBootstrap /> already mounts it;
// exported for apps that render their own bootstrap.
export { default as RealtimeDevBadge } from './client/components/developer/RealtimeDevBadge.svelte';

// TBP-644 — realtime status. `realtimeStatus` is the plain state string;
// `realtimeStatusDetail` adds the reason, whose side it is and whether it is
// still retrying. `onBridgeRealtimeStatus` is the event-style subscription.
export { realtimeStatus, realtimeStatusDetail } from './core/realtime-status.js';
export { onBridgeRealtimeStatus } from './core/bridge-runtime.js';
export type { RealtimeStatus } from '@nebulr-group/bridge-auth-core';
export { default as FeatureFlag } from './flags/FeatureFlag.svelte';
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

// Billing 2.0 (Phase A / US-2) — canonical-model drop-in.
// Parallel to PlanSelector (which consumes the Stripe-direct path); these
// coexist until REF-1 (post-feature) consolidates them.
export { default as BridgeSubscriptionStatus } from './client/components/subscription/BridgeSubscriptionStatus.svelte';

// Billing 2.0 (Phase B / US-5+) — unified notice banner. Multi-state
// (past_due / cancel / trial / dunning). One drop-in, all lifecycle copy.
export { default as BridgeBillingNotice } from './client/components/subscription/BridgeBillingNotice.svelte';

// Fullscreen plan-selection paywall. Drop into the root layout to gate
// unauthenticated/unsubscribed users before they reach the app.
export { default as BridgePaywall } from './client/components/subscription/BridgePaywall.svelte';

// Billing 2.0 (Phase C / US-11) — live quota counter banner.
export { default as BridgeQuotaBanner } from './client/components/subscription/BridgeQuotaBanner.svelte';

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
export type { SessionStalePayload } from '@nebulr-group/bridge-auth-core';

// Billing 2.0 quota shape. `useBridge().quota(metric)` returns this, so a
// TypeScript consumer needs to be able to NAME it — without this re-export the
// only way to type a quota read was to reach into @nebulr-group/bridge-auth-core
// directly or hand-copy the interface, and hand-copied mirrors drift silently
// the first time a field is added.
export type { QuotaSnapshot } from '@nebulr-group/bridge-auth-core';
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

// ----------------------------------------------------------------------------
// Feature Flags 2.0 (re-exported from auth-core)
// ----------------------------------------------------------------------------
// Evaluator / operator runtime values
export {
  OPERATORS,
  OPERATOR_VERSION,
  CONDITIONS_PER_RULE_MAX,
  isOperator,
  isOperatorValidForType,
  validOperatorsForType,
  evaluateCondition,
  validateConditions,
  bucket,
  evaluateBranch,
  evaluateRule,
  validateRule,
  resolveAttribute,
} from '@nebulr-group/bridge-auth-core';

// FF 2.0 SDK runtime values
export {
  BridgeFlags,
  BridgeIdentity,
  MemoryIdentityStorage,
  attachIdentity,
  generateAnonymousId,
  AttributeProviderRegistry,
  AuthAttributeProvider,
  BillingAttributeProvider,
  TelemetryBatcher,
  RealtimeClient,
  BRIDGE_CONTEXT_HEADER,
  serializeContext,
  deserializeContext,
  serverInstanceId,
} from '@nebulr-group/bridge-auth-core';

// FF 2.0 evaluator / SDK types
export type {
  Operator,
  AttributeType,
  Condition,
  ConditionValue,
  ValidationError,
  Branch,
  Rule,
  FlagState,
  EvalContext,
  EvalResult,
  RuleValidationError,
  CachedFlag,
  FlagValueType,
  EvalTelemetry,
  DiscoveryTelemetry,
  BridgeFlagsHooks,
  DeclaredAttributeType,
  AttributeDeclaration,
  BridgeFlagsMode,
  AnonymousTrackingMode,
  IdentityStorage,
  AttributeProvider,
  BillingSnapshot,
  BillingProviderConfig,
  TelemetryBatcherConfig,
  RealtimeClientConfig,
  RealtimeMessage,
  FlagUpdateMessage,
  FlagRemovedMessage,
  UserStateMessage,
  ConnectionState,
  WebSocketLike,
} from '@nebulr-group/bridge-auth-core';

// FF 2.0 management types
export type {
  FlagResponse,
  CreateFlagInput,
  UpdateFlagInput,
  FlagSchedule,
} from '@nebulr-group/bridge-auth-core';

// TBP-629 — deep-link preservation. Re-exported from auth-core so a SvelteKit
// login page can import the reader (and its open-redirect validation) from the
// same package it already depends on, instead of reaching past bridge-svelte.
export {
  DEFAULT_RETURN_TO_PARAM,
  readReturnTo,
  sanitizeReturnTo,
  withReturnTo,
} from '@nebulr-group/bridge-auth-core';
export type { ReturnToConfig } from '@nebulr-group/bridge-auth-core';

// TBP-630 — SDK auth copy / translations. Re-exported from auth-core for the
// same reason as the return-to helpers above: a consumer building its own
// locale catalogue should import from the package it already depends on rather
// than reaching past bridge-svelte to a peer dependency it never declared —
// which pnpm's default layout and Yarn PnP refuse outright.
//
// bridge-react, -angular and -nextjs already export this surface; svelte was
// the odd one out.
export {
  createTranslator,
  en,
  hasLocale,
  interpolate,
  LOCALES,
  normalizeLocale,
  sv,
} from '@nebulr-group/bridge-auth-core';
export type {
  MessageKey,
  MessageOverrides,
  Messages,
  Translator,
} from '@nebulr-group/bridge-auth-core';
