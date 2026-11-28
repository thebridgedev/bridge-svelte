/**
 * A sign-in that is signed in but not finished (TBP-85): on Warn, a person whose password is in a public leak is offered
 * to change it right after signing in, before going on. The session exists by then, so the route guard would send a
 * signed-in person on from the sign-in page before the offer shows. While a sign-in form holds the page, the guard lets
 * the sign-in page stay; the form lets go when the person goes on (changed, or "Not now") or the form goes away.
 */
let holds = 0;

/** Holds the sign-in page for a signed-in person; call the returned function to let go (once is enough, twice is harmless). */
export function holdSignInPage(): () => void {
	holds += 1;
	let released = false;
	return () => {
		if (released) return;
		released = true;
		holds -= 1;
	};
}

/** Whether a sign-in form holds the sign-in page now. */
export function signInPageHeld(): boolean {
	return holds > 0;
}
