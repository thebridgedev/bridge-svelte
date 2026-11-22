/**
 * The terms line shown where an account can be made: "By continuing you accept [app]'s Terms of Service and Privacy
 * Policy", with the two names linked to the app's own pages. The sentence comes from the language's catalogue, with
 * `{terms}` and `{privacy}` where the links go, so each language puts them where its grammar wants them.
 */
export type TermsPart = { readonly text: string } | { readonly link: 'terms' | 'privacy'; readonly label: string };

/** A page address the line may link to: http or https only. Anything else is shown as plain text, never as a link. */
export function safePage(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	try {
		const url = new URL(value);
		return (url.protocol === 'https:' || url.protocol === 'http:') && url.username === '' && url.password === '' ? url.href : null;
	} catch {
		return null;
	}
}

/** Splits the sentence into text and the two links, in the order the language writes them. */
export function termsParts(sentence: string, labels: { readonly terms: string; readonly privacy: string }): TermsPart[] {
	return sentence
		.split(/(\{terms\}|\{privacy\})/)
		.filter((piece) => piece !== '')
		.map((piece): TermsPart => {
			if (piece === '{terms}') return { link: 'terms', label: labels.terms };
			if (piece === '{privacy}') return { link: 'privacy', label: labels.privacy };
			return { text: piece };
		});
}
