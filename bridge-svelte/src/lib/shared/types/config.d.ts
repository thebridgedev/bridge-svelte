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
     * Root URL of the Bridge API.
     * @default 'https://api.thebridge.dev'
     */
    apiBaseUrl?: string;
    /**
     * Base URL of the Bridge hosted UI (cloud-views).
     * @default 'https://auth.thebridge.dev'
     */
    hostedUrl?: string;
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
