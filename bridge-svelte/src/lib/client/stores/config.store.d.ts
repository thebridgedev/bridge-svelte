import type { BridgeConfig } from '../../shared/types/config';
export declare const bridgeConfig: import("svelte/store").Writable<BridgeConfig | null>;
export declare const readonlyConfig: import("svelte/store").Readable<BridgeConfig | null>;
export declare const configReady: import("svelte/store").Readable<boolean>;
export declare function initConfig(config: BridgeConfig): void;
export declare function getConfig(): BridgeConfig;
