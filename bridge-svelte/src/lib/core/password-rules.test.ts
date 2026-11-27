import { describe, expect, it } from 'vitest';
import { checklistMet, checklistOf } from './password-rules.js';

describe('the password checklist', () => {
	it('shows the length before anyone types, and ticks it as they type', () => {
		expect(checklistOf({ minLength: 12 }, '')).toEqual([{ rule: 'minLength', key: 'rules.minLength', vars: { count: 12 }, met: false }]);
		expect(checklistOf({ minLength: 12 }, 'correct horse battery')[0]?.met).toBe(true);
		// Counted in characters after NFKC, as Bridge counts them.
		expect(checklistOf({ minLength: 8 }, 'e\u0301'.repeat(7))[0]?.met).toBe(false);
	});

	it('lists the mix rules, the address and the two rules only Bridge checks', () => {
		const rules = { minLength: 12, requireUpper: true, requireLower: true, requireDigit: true, requireSymbol: true, blockEmail: true, blockCommon: true, blockAppName: true };
		const items = checklistOf(rules, 'Abcdefgh1!xyz', 'anna@acme.test');
		expect(items.map((item) => [item.rule, item.met])).toEqual([
			['minLength', true],
			['requireUpper', true],
			['requireLower', true],
			['requireDigit', true],
			['requireSymbol', true],
			['blockEmail', true],
			['blockCommon', null],
			['blockAppName', null],
		]);
		expect(checklistMet(items)).toBe(true);
		expect(checklistOf(rules, 'anna-secret-123!A', 'anna@acme.test').find((item) => item.rule === 'blockEmail')?.met).toBe(false);
		// No address known (a reset link): Bridge checks it.
		expect(checklistOf(rules, 'anna-secret-123!A').find((item) => item.rule === 'blockEmail')?.met).toBeNull();
		expect(checklistMet(checklistOf(rules, 'short'))).toBe(false);
	});

	it('defaults to 8 characters when the rules are not known yet', () => {
		expect(checklistOf(undefined, '12345678')).toEqual([{ rule: 'minLength', key: 'rules.minLength', vars: { count: 8 }, met: true }]);
	});
});
