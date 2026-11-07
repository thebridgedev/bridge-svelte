// The app's server checks the token each API call carries, through Bridge.
// BRIDGE_APP_KEY (the app's own key, server-side only) is needed to count usage.
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import type { Handle } from '@sveltejs/kit';
import { bridgeHandle } from '@nebulr-group/bridge-svelte/server';

const issuer = publicEnv.PUBLIC_BRIDGE_ISSUER;

export const handle: Handle = issuer
	? bridgeHandle({ issuer, ...(env.BRIDGE_APP_KEY ? { appKey: env.BRIDGE_APP_KEY } : {}) })
	: ({ event, resolve }) => resolve(event);
