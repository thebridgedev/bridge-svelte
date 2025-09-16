export const ssr = false;

import type { RouteGuardConfig } from '@nblocks-svelte/lib/auth/route-guard';
import { nblocksBootstrap } from '@nblocks-svelte/lib/client/NblocksBootstrap'; // Import the new function
import type { NblocksConfig } from '@nblocks-svelte/lib/shared/types/config';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ url }) => {  

  const config: NblocksConfig = {
    appId: import.meta.env.VITE_NBLOCKS_APP_ID,  
    callbackUrl: import.meta.env.VITE_NBLOCKS_CALLBACK_URL,
    // teamManagementUrl: import.meta.env.VITE_NBLOCKS_TEAM_MANAGEMENT_URL,
    // authBaseUrl: import.meta.env.VITE_NBLOCKS_AUTH_BASE_URL,
    // backendlessBaseUrl: import.meta.env.VITE_NBLOCKS_BACKENDLESS_BASE_URL,
    // defaultRedirectRoute: '/',
    // loginRoute: '/login',
    debug: import.meta.env.VITE_NBLOCKS_DEBUG === 'true'
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

  await nblocksBootstrap(url, config, routeConfig);

  // Return any data your layout components need
  return {
    config,
    routeConfig
  };
}