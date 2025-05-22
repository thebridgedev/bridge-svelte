export declare function loadFeatureFlags(): Promise<void>;
export declare function isFeatureEnabled(flag: string, forceLive?: boolean): Promise<boolean>;
export declare const featureFlags: {
    flags: import("svelte/store").Writable<Record<string, boolean>>;
    refresh: typeof loadFeatureFlags;
};
