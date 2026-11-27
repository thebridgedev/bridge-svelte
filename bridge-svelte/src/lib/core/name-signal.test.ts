import { describe, expect, it } from "vitest";
import { signalNewName } from "./name-signal.js";

describe("a changed name reaches the password manager", () => {
	const told: [string, string][] = [];
	const bridge = { passkeys: { signalCurrentUser: async (name: string, displayName: string) => void told.push([name, displayName]) } };

	it("tells the browser the email and the new full name, only when the name changed", async () => {
		await signalNewName(bridge, { email: "anna@acme.test", firstName: "Anna", lastName: "Berg" }, true);
		await signalNewName(bridge, { email: "anna@acme.test", firstName: "Anna", lastName: "Berg" }, false);
		await signalNewName(bridge, { email: "anna@acme.test", firstName: null, lastName: "" }, true);
		expect(told).toEqual([["anna@acme.test", "Anna Berg"], ["anna@acme.test", "anna@acme.test"]]);
	});

	it("never fails the save", async () => {
		await expect(signalNewName({ passkeys: { signalCurrentUser: () => Promise.reject(new Error("no")) } }, { email: "a@b.c", firstName: "A", lastName: null }, true)).resolves.toBeUndefined();
	});
});
