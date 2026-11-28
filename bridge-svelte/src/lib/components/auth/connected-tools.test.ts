import { describe, expect, it } from 'vitest';
import { setAppCopy, translator } from '../../core/i18n.js';
import { toolRows, withoutTool, type ListedSession } from './connected-tools.js';
import * as bridge from '../../index.js';

/** Connected tools in the Security settings: the person's assistant and CLI sessions, disconnected after a confirm. */

const files = import.meta.glob('./*.svelte', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const source = (name: string) => files[`./${name}.svelte`] as string;

const sessions: ListedSession[] = [
	{ id: 's-web', current: true, signedInAt: '2026-11-25T10:00:00.000Z', lastUsedAt: '2026-11-27T10:00:00.000Z', methods: ['password'], kind: 'browser', clientId: null, client: { id: 'a1', name: 'Browser' }, workspace: { id: 'w1', name: 'Marketing' }, delete: true },
	{ id: 's-claude', signedInAt: '2026-11-20T10:00:00.000Z', lastUsedAt: '2026-11-26T10:00:00.000Z', methods: ['password'], kind: 'assistant', clientId: 'claude', client: { id: 'claude', name: 'Claude' }, workspace: { id: 'w1', name: 'Marketing' }, delete: false },
	{ id: 's-cli', signedInAt: '2026-11-22T10:00:00.000Z', lastUsedAt: null, methods: ['password'], kind: 'cli', clientId: 'a1', client: { id: 'a1', name: 'CLI' }, workspace: null, delete: false }
];

describe('the connected tools', () => {
	it('are the assistant and CLI sessions, newest first, with name, kind, workspace and dates; never browser sessions', () => {
		expect(toolRows(sessions)).toEqual([
			{ id: 's-cli', name: 'CLI', kind: 'cli', workspace: null, signedInAt: '2026-11-22T10:00:00.000Z', lastUsedAt: null },
			{ id: 's-claude', name: 'Claude', kind: 'assistant', workspace: 'Marketing', signedInAt: '2026-11-20T10:00:00.000Z', lastUsedAt: '2026-11-26T10:00:00.000Z' }
		]);
		expect(withoutTool(toolRows(sessions) ?? [], 's-claude').map((each) => each.id)).toEqual(['s-cli']);
	});

	it('take the client id when the server names no client, and are none when only browsers are signed in', () => {
		expect(toolRows([{ id: 's', signedInAt: '2026-11-20T10:00:00.000Z', lastUsedAt: null, kind: 'assistant', clientId: 'mcp_abc' }])?.[0]?.name).toBe('mcp_abc');
		expect(toolRows([sessions[0] as ListedSession])).toEqual([]);
	});

	it('are not shown when the server does not say which sessions are tools (an older server)', () => {
		expect(toolRows([{ id: 's', signedInAt: '2026-11-20T10:00:00.000Z', lastUsedAt: null }])).toBeNull();
		const component = source('ConnectedTools');
		expect(component).toMatch(/if \(rows === null\) shown = false/);
		expect(component).toMatch(/catch \(error\) \{\s*shown = false/);
		expect(component).toMatch(/\{#if shown\}/);
	});

	it('lists through auth-core and disconnects only after the confirm', () => {
		const component = source('ConnectedTools');
		expect(component).toMatch(/getBridge\(\)\.sessions\.list\(\)/);
		expect(component).toMatch(/getBridge\(\)\.sessions\.end\(tool\.id\)/);
		// The row's button only opens the confirm; the confirm's button disconnects.
		expect(component).toMatch(/data-bridge-connected-tool-disconnect onclick=\{\(\) => \(confirming = tool\.id\)\}/);
		expect(component).toMatch(/data-bridge-connected-tool-disconnect-confirm onclick=\{\(\) => disconnect\(tool\)\}/);
		expect(component).toMatch(/data-bridge-connected-tools-empty/);
	});

	it('is exported next to PasskeyManager', () => {
		expect(bridge.ConnectedTools).toBeDefined();
		expect(bridge.PasskeyManager).toBeDefined();
		expect(bridge.toolRows).toBe(toolRows);
	});

	it('has its copy in every language', () => {
		const keys = ['tools.heading', 'tools.intro', 'tools.empty', 'tools.assistant', 'tools.cli', 'tools.connected', 'tools.lastUsed', 'tools.disconnect', 'tools.confirm', 'tools.cancel'] as const;
		for (const locale of ['en', 'sv', 'da', 'nb', 'nl', 'de', 'fi', 'fr', 'es', 'it', 'pt', 'pl']) {
			setAppCopy(locale, {});
			const t = translator();
			for (const key of keys) expect(t(key), `${locale} ${key}`).not.toBe('');
			expect(t('tools.confirm', { name: 'Claude' }), locale).toContain('Claude');
			expect(t('tools.connected', { date: '27/11/2026' }), locale).toContain('27/11/2026');
		}
		setAppCopy(undefined, {});
	});
});
