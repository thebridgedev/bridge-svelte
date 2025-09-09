import type { NblocksConfig } from '../../shared/types/config';
export declare const nblocksConfig: import("svelte/store").Writable<NblocksConfig | null>;
export declare const readonlyConfig: import("svelte/store").Readable<NblocksConfig | null>;
export declare const configReady: import("svelte/store").Readable<boolean>;
export declare function initConfig(config: NblocksConfig): void;
export declare function getConfig(): NblocksConfig;
