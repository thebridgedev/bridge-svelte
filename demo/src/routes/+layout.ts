export const ssr = false;

import type { RouteGuardConfig } from '@bridge-svelte/lib/auth/route-guard';
import { bridgeBootstrap } from '@bridge-svelte/lib/client/BridgeBootstrap'; // Import bridge new function
import type { BridgeConfig } from '@bridge-svelte/lib/shared/types/config';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ url }) => {  


  const isProd =
    import.meta.env.VITE_ENVIRONMENT === 'prod' ||
    import.meta.env.ENVIRONMENT === 'prod' ||
    import.meta.env.VITE_ENV === 'prod';
  console.log('isProd', isProd);

  const baseConfig: BridgeConfig = {
    appId: localStorage.getItem('bridge:appId') || import.meta.env.VITE_BRIDGE_APP_ID || '',
    callbackUrl: import.meta.env.VITE_BRIDGE_CALLBACK_URL,
    loginRoute: '/auth/login',
    debug: true
  };

  let config: BridgeConfig;
  if (!isProd) {
    const extras: Partial<BridgeConfig> = {};
    const apiBaseUrl = import.meta.env.VITE_BRIDGE_API_BASE_URL;
    if (apiBaseUrl) extras.apiBaseUrl = apiBaseUrl;
    const hostedUrl = import.meta.env.VITE_BRIDGE_HOSTED_URL;
    if (hostedUrl) extras.hostedUrl = hostedUrl;
    config = { ...baseConfig, ...extras } as BridgeConfig;
  } else {
    config = baseConfig;
  }

  

  const routeConfig: RouteGuardConfig = {
    rules: [
      { match: '/', public: true },
      { match: new RegExp('^/auth($|/)'), public: true },
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