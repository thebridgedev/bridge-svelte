import { describe, expect, it } from 'vitest';
import { setAppCopy, translator } from '../../core/i18n.js';
import { assistantsSwitch } from './workspace-assistants.js';

/** "Allow AI assistants" in the workspace settings: for the Owner only, when Bridge answers the field. */

const files = import.meta.glob('./*.svelte', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const form = files['./WorkspaceForm.svelte'] as string;

describe('Allow AI assistants', () => {
	it("is shown to the workspace's Owner with its value, and to nobody else", () => {
		expect(assistantsSwitch({ id: 'w', assistants: true }, 'OWNER')).toBe(true);
		expect(assistantsSwitch({ id: 'w', assistants: false }, 'OWNER')).toBe(false);
		expect(assistantsSwitch({ id: 'w', assistants: true }, 'ADMIN')).toBeNull();
		expect(assistantsSwitch({ id: 'w', assistants: true }, '')).toBeNull();
	});

	it('is not shown when the workspace answer has no such field (an older Bridge), or before it is read', () => {
		expect(assistantsSwitch({ id: 'w' }, 'OWNER')).toBeNull();
		expect(assistantsSwitch(null, 'OWNER')).toBeNull();
	});

	it('is saved as soon as it is switched, with PATCH /workspace { assistants }', () => {
		expect(form).toMatch(/getBridge\(\)\.team\.workspace\.update\(\{ assistants: on \}/);
		expect(form).toMatch(/\{#if assistants !== null\}/);
		expect(form).toMatch(/role="switch"/);
	});

	it('has its copy in every language', () => {
		for (const locale of ['en', 'sv', 'da', 'nb', 'nl', 'de', 'fi', 'fr', 'es', 'it', 'pt', 'pl']) {
			setAppCopy(locale, {});
			const t = translator();
			expect(t('workspace.assistants'), locale).not.toBe('');
			expect(t('workspace.assistantsHelp'), locale).toContain('Claude');
		}
		setAppCopy(undefined, {});
	});
});
