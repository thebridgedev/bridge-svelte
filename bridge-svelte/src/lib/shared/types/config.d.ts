export interface BridgeConfig {
    /**
     * Your Bridge application ID
     * @required
     */
    appId: string;
    /**
     * The URL to redirect to after successful login
     * @default The current origin + '/auth/callback'
     */
    callbackUrl?: string;
    /**
     * The base URL for Bridge auth services
     * @default 'https://api.thebridge.dev/auth'
     */
    authBaseUrl?: string;
    /**
     * Route to redirect to after login
     * @default '/'
     */
    defaultRedirectRoute?: string;
    /**
     * Route to redirect to when authentication fails
     * @default '/login'
     */
    loginRoute?: string;
    /**
     * URL for bridge team management portal
     * @default 'https://api.thebridge.dev/cloud-views/user-management-portal/users'
     */
    teamManagementUrl?: string;
    /**
     * Base URL for bridge cloud-views service (for plan selection, payments, feature flags, etc.)
     * @default 'https://api.thebridge.dev/cloud-views'
     */
    cloudViewsUrl?: string;
    /**
     * Debug mode
     * @default false
     */
    debug?: boolean;
}
export interface TokenSet {
    accessToken: string;
    refreshToken: string;
    idToken: string;
}
