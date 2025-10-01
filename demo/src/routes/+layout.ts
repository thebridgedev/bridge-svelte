export const ssr = false;

import type { RouteGuardConfig } from '@bridge-svelte/lib/auth/route-guard';
import { bridgeBootstrap } from '@bridge-svelte/lib/client/BridgeBootstrap'; // Import bridge new function
import type { BridgeConfig } from '@bridge-svelte/lib/shared/types/config';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ url }) => {  

  const config: BridgeConfig = {
    appId: import.meta.env.VITE_BRIDGE_APP_ID,  
    callbackUrl: import.meta.env.VITE_BRIDGE_CALLBACK_URL,
    teamManagementUrl: import.meta.env.VITE_BRIDGE_TEAM_MANAGEMENT_URL,
    authBaseUrl: import.meta.env.VITE_BRIDGE_AUTH_BASE_URL,
    backendlessBaseUrl: import.meta.env.VITE_BRIDGE_BACKENDLESS_BASE_URL,
    // defaultRedirectRoute: '/',
    // loginRoute: '/login',
    debug: import.meta.env.VITE_BRIDGE_DEBUG === 'true'
  };

  const routeConfig: RouteGuardConfig = {
    rules: [
      { match: '/', public: true },
      { match: '/login', public: true },
      { match: new RegExp('^/auth/oauth-callback$'), public: true },
    //   { match: new RegExp('^/.well-known*'), public: true },
      { match: new RegExp('^/docs($|/)'), public: true },
      { match: '/beta*', featureFlag: 'test-global-admin-access', redirectTo: '/',public: true },
      // { match: '/*', featureFlag:'global-feature', redirectTo: '/login'}
    ],
    defaultAccess: 'protected'
  };

  await bridgeBootstrap(url, config, routeConfig);
  // await bridgeBootstrap(url, "671279b938f34e0008b0f80b", routeConfig);

  // Return any data your layout components need
  return {
    config,
    routeConfig
  };
}