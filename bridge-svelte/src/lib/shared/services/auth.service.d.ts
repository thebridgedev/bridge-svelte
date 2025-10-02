import type { TokenSet } from './types/config';
declare function clearTokens(): void;
declare function login(options?: {
    redirectUri?: string;
}): Promise<void>;
declare function createLoginUrl(options?: {
    redirectUri?: string;
}): string;
declare function handleCallback(code: string): Promise<void>;
declare function refreshToken(refreshToken: string): Promise<TokenSet | null>;
export declare const auth: {
    token: import("svelte/store").Writable<any>;
    isAuthenticated: import("svelte/store").Readable<boolean>;
    isLoading: import("svelte/store").Writable<boolean>;
    error: import("svelte/store").Writable<string | null>;
    login: typeof login;
    logout: typeof clearTokens;
    handleCallback: typeof handleCallback;
    refreshToken: typeof refreshToken;
    createLoginUrl: typeof createLoginUrl;
    getToken: () => any;
};
export { };

