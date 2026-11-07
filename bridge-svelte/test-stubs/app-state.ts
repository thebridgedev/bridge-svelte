// Test stand-in for SvelteKit's $app/state.
export const page = { url: new URL('http://localhost/'), params: {} as Record<string, string>, state: {} };
