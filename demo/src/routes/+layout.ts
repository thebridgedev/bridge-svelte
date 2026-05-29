export const ssr = false;

import { redirect } from '@sveltejs/kit';
import type { RouteGuardConfig } from '@bridge-svelte/lib/auth/route-guard';
import { bridgeBootstrap } from '@bridge-svelte/lib/client/BridgeBootstrap';
import type { BridgeConfig } from '@bridge-svelte/lib/shared/types/config';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ url, fetch }) => {


  const isProd =
    import.meta.env.VITE_ENVIRONMENT === 'prod' ||
    import.meta.env.ENVIRONMENT === 'prod' ||
    import.meta.env.VITE_ENV === 'prod';
  console.log('isProd', isProd);

  const baseConfig: BridgeConfig = {
    appId: localStorage.getItem('bridge:appId') || import.meta.env.VITE_BRIDGE_APP_ID || '',
    callbackUrl: import.meta.env.VITE_BRIDGE_CALLBACK_URL,
    loginRoute: '/auth/login',
    debug: true,
    billing: { paywallRoute: '/welcome', paymentErrorRoute: '/payment-error' },
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
      { match: '/welcome', public: true },
    //   { match: new RegExp('^/.well-known*'), public: true },
      { match: new RegExp('^/docs($|/)'), public: true },
      { match: '/beta*', featureFlag: 'test-global-admin-access', redirectTo: '/',public: true },
      // /flag-context-demo — TBP-178 E2E sandbox; FF 2.0 works without auth
      { match: '/flag-context-demo', public: true },
      // /discovery-probe — TBP-241 Phase 1.5 release-validation probe;
      // exercises SDK discover-flow against an arbitrary ?key=, no auth needed.
      { match: '/discovery-probe', public: true },
      // /attr-probe — TBP-241 Phase 2 rule-coverage probe; reads ?key= +
      // ?attrs= JSON and forwards as per-call attributes to useFlag.
      // Public so #9 / #13 / #15 don't need to log in.
      { match: '/attr-probe', public: true },
      // { match: '/*', featureFlag:'global-feature', redirectTo: '/login'}
    ],
    defaultAccess: 'protected'
  };

  await bridgeBootstrap(url, config, routeConfig, fetch);

  // Return any data your layout components need
  return {
    config,
    routeConfig
  };
}