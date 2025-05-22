import type { NblocksConfig } from '../../shared/types/config.js';
export declare function getConfigFromEnv(): NblocksConfig;
export declare const nblocksConfig: import("svelte/store").Writable<NblocksConfig>;
export declare const readonlyConfig: import("svelte/store").Readable<NblocksConfig>;
export declare function initConfig(config: NblocksConfig): void;
export declare function getConfig(): NblocksConfig;
