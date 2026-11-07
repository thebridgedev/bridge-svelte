import type { BridgeLocals } from '@nebulr-group/bridge-svelte/server';

declare global {
	namespace App {
		interface Locals {
			bridge: BridgeLocals;
		}
	}
}

export {};
