/** The names of the providers people sign in with, for "Managed by Google". */
const PROVIDERS: Readonly<Record<string, string>> = {
	google: 'Google',
	microsoft: 'Microsoft',
	azure: 'Microsoft',
	apple: 'Apple',
	facebook: 'Facebook',
	github: 'GitHub',
	linkedin: 'LinkedIn',
};

/** A provider's name as people know it: `google` is Google; a company's provider keeps the name Bridge gives it. */
export function providerName(provider: string | null | undefined): string {
	if (provider === null || provider === undefined || provider === '') return '';
	return PROVIDERS[provider.toLowerCase()] ?? provider;
}
