export interface NblocksConfig {
  /**
   * Your nBlocks application ID
   * @required
   */
  appId: string;

  /**
   * The URL to redirect to after successful login
   * @default The current origin + '/auth/callback'
   */
  callbackUrl?: string;

  /**
   * The base URL for nBlocks auth services
   * @default 'https://auth.nblocks.cloud'
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
   * URL for the team management portal
   * @default 'https://backendless.nblocks.cloud'
   */
  teamManagementUrl?: string;

  /**
   * Debug mode
   * @default false
   */
  debug?: boolean;
} 