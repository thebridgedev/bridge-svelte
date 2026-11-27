/**
 * What a six-digit code field keeps of what is typed or pasted: the digits only, at most `length` of them. A pasted
 * "123 456", "123-456" or "Your code: 123456" becomes "123456".
 */
export function codeDigits(typed: string, length = 6): string {
	return typed.replace(/\D/g, '').slice(0, length);
}

/** A countdown's seconds as `m:ss`, for "Send a new code in 0:42". */
export function countdown(seconds: number): string {
	const whole = Math.max(0, Math.ceil(seconds));
	return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** Recovery codes as a text file to download or print: one code per line, under a heading. */
export function recoveryCodesText(codes: readonly string[], heading: string): string {
	return `${heading}\n\n${codes.join('\n')}\n`;
}
