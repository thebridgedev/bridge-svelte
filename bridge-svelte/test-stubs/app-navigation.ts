// Test stand-in for SvelteKit's $app/navigation.
export const calls: { goto: string[]; invalidate: string[] } = { goto: [], invalidate: [] };
export async function goto(url: string): Promise<void> {
	calls.goto.push(url);
}
export async function invalidate(dep: string): Promise<void> {
	calls.invalidate.push(dep);
}
export function replaceState(): void {}
