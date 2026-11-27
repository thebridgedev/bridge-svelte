// The guides this repo's 1.0 line serves to AI agents (mcp/ and learning/, read from the v1 branch by the Bridge MCP
// server and by CLI 1.0's `bridge guide`) teach only what bridge-svelte 1.0 and CLI 1.0 have (TBP-292, TBP-356):
//
// - no 0.x setting, component or wording (the banned list);
// - every name imported from the package exists in its exports, and only its three entry points are imported;
// - every `bridge <command>` and its options exist in CLI 1.0's command tree (scripts/cli-1.0-commands.txt);
// - every `--bridge-*` token exists in styles.css (TBP-831);
// - the billing and flag guides split their checks into terminal and browser ones (TBP-812);
// - and, as on 0.x (TBP-705), no guide teaches a direct role, privilege or plan check. That list MIRRORS bridge-cli
//   v1 `src/gate-rules.ts` (DOC_FORBIDDEN), which also drives `bridge check gates`: change it there first.
//
// Lives in src/ (not src/lib) so svelte-package never copies it into dist.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PACKAGE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(PACKAGE, '..');

function markdownFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return markdownFiles(path);
		return name.endsWith('.md') ? [path] : [];
	});
}

const read = (file: string) => readFileSync(file, 'utf8');
const guides = [...markdownFiles(join(REPO, 'mcp')), ...markdownFiles(join(REPO, 'learning'))];
const named = (file: string) => relative(REPO, file);

// ── 0.x names and wording ───────────────────────────────────────────────────

const BANNED: Array<[string, RegExp]> = [
	['a 0.x setting', /\bVITE_BRIDGE_[A-Z_]+\b/],
	['a 0.x setting', /\bBRIDGE_API_BASE_URL\b/],
	['a 0.x setting', /\bPUBLIC_BRIDGE_APP_ID\b/],
	['a 0.x CLI option', /--ui-url\b/],
	['a 0.x CLI command', /\bbridge app redirect-uris\b/],
	['a direct plan-feature component', /<Entitled\b/],
	['the old Bridge API', /\bbridge-api\b/],
	['the old Bridge API', /\bapi(?:-stage)?\.thebridge\.dev\b/],
	['the unshipped surface', /\b(?:initBridge|useBridge)\b/],
	['a 0.x entry point', /@nebulr-group\/bridge-svelte\/flags\b/],
	['a 0.x option or store', /\b(?:loginRoute|profileStore|isAuthenticated|tokenStore)\b/],
	['browser checks talked down (E5)', /display,? not enforcement|\bdisplay[- ]only\b|\bdecoration\b|\bonly decorate\b/i],
	['the agent verifies alone (TBP-812)', /the agent verifies/i],
];

function banned(markdown: string): string[] {
	const out: string[] = [];
	markdown.split('\n').forEach((line, i) => {
		for (const [rule, pattern] of BANNED) if (pattern.test(line)) out.push(`${i + 1}: ${rule}: ${line.trim()}`);
	});
	return out;
}

// ── Imports from the package ────────────────────────────────────────────────

/** The names an entry point exports, read from its source. */
function exportsOf(file: string): Set<string> {
	const source = read(file);
	const names = new Set<string>();
	for (const block of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
		for (const part of block[1].split(',')) {
			const name = part.trim().split(/\s+as\s+/).pop()?.trim();
			if (name) names.add(name.replace(/^type\s+/, ''));
		}
	}
	for (const each of source.matchAll(/export\s+(?:async\s+)?(?:function|const|class|interface|type)\s+([A-Za-z_$][\w$]*)/g)) names.add(each[1]);
	return names;
}

const ENTRY_POINTS: Record<string, Set<string> | null> = {
	'@nebulr-group/bridge-svelte': exportsOf(join(PACKAGE, 'src/lib/index.ts')),
	'@nebulr-group/bridge-svelte/server': exportsOf(join(PACKAGE, 'src/lib/server/index.ts')),
	'@nebulr-group/bridge-svelte/styles': null,
};

function badImports(markdown: string): string[] {
	const out: string[] = [];
	for (const each of markdown.matchAll(/import\s+(?:type\s+)?(?:\{([^}]*)\}\s+from\s+)?['"](@nebulr-group\/bridge-svelte[^'"]*)['"]/g)) {
		const [, names, from] = each;
		if (!(from in ENTRY_POINTS)) {
			out.push(`${from} is not an entry point of 1.0`);
			continue;
		}
		const known = ENTRY_POINTS[from];
		if (known === null || names === undefined) continue;
		for (const part of names.split(',')) {
			const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]?.trim();
			if (name && !known.has(name)) out.push(`${name} is not exported by ${from}`);
		}
	}
	return out;
}

// ── CLI 1.0 commands ────────────────────────────────────────────────────────

interface CliCommand {
	readonly args: boolean;
	readonly options: Set<string>;
}

const COMMANDS = new Map<string, CliCommand>();
for (const line of read(join(REPO, 'scripts/cli-1.0-commands.txt')).split('\n')) {
	if (line.startsWith('#') || line.trim() === '') continue;
	const [head, options = ''] = line.split('\t');
	const words = head.trim().split(/\s+/);
	const path = words.filter((w) => !w.startsWith('<') && !w.startsWith('[')).join(' ');
	COMMANDS.set(path, { args: words.length > path.split(' ').length, options: new Set(options.split(/\s+/).filter(Boolean)) });
}
const GLOBAL_OPTIONS = COMMANDS.get('bridge')?.options ?? new Set<string>();
const hasChildren = (path: string) => [...COMMANDS.keys()].some((each) => each.startsWith(`${path} `));

/** Words of a command line, quotes kept together. */
function tokens(text: string): string[] {
	return text.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
}

/** What is wrong with one `bridge …` invocation, or null. */
function checkInvocation(words: readonly string[]): string | null {
	let path = 'bridge';
	let i = 0;
	while (i < words.length && /^[a-z][a-z0-9-]*$/.test(words[i]) && COMMANDS.has(`${path} ${words[i]}`)) path = `${path} ${words[i++]}`;
	const command = COMMANDS.get(path);
	if (command === undefined) return `no command ${path}`;
	const next = words[i];
	if (path === 'bridge' && next !== undefined && /^[a-z][a-z0-9-]*$/.test(next)) return `no command bridge ${next}`;
	if (next !== undefined && /^[a-z][a-z0-9-]*$/.test(next) && hasChildren(path) && !command.args) return `no command ${path} ${next}`;
	for (const word of words.slice(i)) {
		if (word === '|' || word === '&&' || word === ';' || word.startsWith('#')) break;
		if (!word.startsWith('--')) continue;
		const option = word.split('=')[0];
		if (!command.options.has(option) && !GLOBAL_OPTIONS.has(option)) return `${path} has no option ${option}`;
	}
	return null;
}

/** The `bridge …` invocations in a guide: in code spans and code blocks, also as `npx @nebulr-group/bridge-cli@alpha …`. */
function invocations(markdown: string): string[][] {
	const snippets: string[] = [];
	let fence: string[] | null = null;
	for (const line of markdown.split('\n')) {
		if (/^\s*(?:```|~~~)/.test(line)) {
			if (fence === null) fence = [];
			else {
				snippets.push(...fence.join('\n').replace(/\\\n\s*/g, ' ').split('\n'));
				fence = null;
			}
			continue;
		}
		if (fence !== null) fence.push(line);
		else for (const span of line.matchAll(/`([^`]+)`/g)) snippets.push(span[1]);
	}
	const out: string[][] = [];
	for (const snippet of snippets) {
		const words = tokens(snippet);
		words.forEach((word, i) => {
			if (word === 'bridge' || /^@nebulr-group\/bridge-cli(?:@[\w.-]+)?$/.test(word)) {
				// A command line starts with the CLI, not prose such as "the `bridge` cascade layer".
				if (word === 'bridge' && i > 0 && !['npx', 'bunx', 'then', '$', '&&', ';', '('].includes(words[i - 1])) return;
				if (word !== 'bridge' && !['npx', 'bunx'].includes(words[i - 1] ?? '')) return;
				out.push(words.slice(i + 1).map((w) => w.replace(/[`.,)]+$/, '')));
			}
		});
	}
	return out;
}

function badCommands(markdown: string): string[] {
	return invocations(markdown)
		.map((words) => ({ words, problem: checkInvocation(words) }))
		.filter((each) => each.problem !== null)
		.map((each) => `${each.problem} (bridge ${each.words.join(' ')})`);
}

// ── Theme tokens ────────────────────────────────────────────────────────────

const TOKENS = new Set(read(join(PACKAGE, 'src/lib/styles.css')).match(/--bridge-[a-z0-9-]*[a-z0-9]/g) ?? []);

function badTokens(markdown: string): string[] {
	return [...new Set(markdown.match(/--bridge-[a-z0-9-]*[a-z0-9]/g) ?? [])].filter((token) => !TOKENS.has(token));
}

// ── TBP-705, mirror of bridge-cli v1 src/gate-rules.ts (docs part) ──────────

const DOC_FORBIDDEN: Array<[string, RegExp]> = [
	['a role compared in code', /\b(?:user|session|claims|token|me|currentUser|profile|locals\.user|req\.user|\$user|\$profile)\??\.role\s*(?:===|!==|==|!=)/],
	['a role compared in code', /\brole\s*(?:===|!==|==|!=)\s*['"`]/i],
	['a role list checked in code', /\[\s*['"][A-Z_]+['"](?:\s*,\s*['"][A-Z_]+['"])*\s*\]\s*\.includes\(/],
	['a role checked in code', /\bhasRole\s*\(/],
	['a role decorator on a handler', /@RequireRole\s*\(/],
	['a role check on the page', /\brole check\b[^.\n]{0,30}\b(?:in|on) (?:the |your )?(?:page|component|code|handler|layout|controller)/i],
	['a role check on the page', /\bcheck\w*\b[^.\n]{0,30}\brole\b[^.\n]{0,30}\b(?:in|on) (?:the |your )?(?:page|component|code|layout)\b/i],
	['"target a role instead"', /target a role instead/i],
	['privileges read in code', /\bprivileges\s*\??\.\s*(?:includes|some|indexOf|has)\s*\(/],
	['a direct plan-feature check', /<Entitled\b/],
	['a direct plan-feature check', /\bentitlements\s*\??\.\s*can\s*\(/],
	['a direct plan-feature check', /@RequireEntitlement\s*\(/],
	['a direct plan-feature check', /\brequireEntitlement\s*\(/],
	['a removed Express protect option', /\bprotect\s*\(\s*\{[^}\n]*\b(?:role|plans|entitlements?)\s*:/],
	['a plan name compared in code', /\.plan(?:Key|Name|Slug)?\s*(?:===|!==|==|!=)\s*['"`]/],
	['a plan name compared in code', /\bplan(?:Key|Name|Slug)?\s*(?:===|!==|==|!=)\s*['"`]/i],
	['a plan-name helper', /\bis(?:Pro|Free|Enterprise|Team|Business)(?:Plan|User)?\b\s*[(=]/],
	['a route rule on plans', /\bplans\s*:\s*\[/],
	['a route rule on a role', /\{[^}\n]*\b(?:match|path)\s*:[^}\n]*\brole\s*:\s*['"`]/],
	['a route rule on a privilege', /\bprivilege\s*:\s*['"`](?!(?:ANONYMOUS|AUTHENTICATED)['"`])[A-Za-z][A-Za-z0-9_.:-]*['"`]/],
	['a flag rule that names plans', /"attribute"\s*:\s*"(?:tenant\.plan|bridge:billing\.plan)"/],
	['browser counting called demo-grade', /demo[- ]grade/i],
	['browser counting called display only', /display,? not enforcement/i],
	['browser counting said unable to refuse', /only (?:a|the|your) backend can (?:refuse|enforce|stop)/i],
	['browser counting said not to work', /\b(?:browser|frontend|client)(?:[- ](?:only|side))?\b[^.\n]{0,40}\b(?:won't|will not|does not|doesn't|cannot|can't|can not) (?:work|enforce|be trusted)/i],
	['browser counting said not production-ready', /\b(?:browser|frontend|client)\b[^.\n]{0,60}\bnot (?:production|prod)[- ](?:ready|grade)/i],
	['privileges said to match as text', /\b(?:matched|matches|match) (?:privilege keys )?as text\b|\bno other (?:privilege )?key contains\b/i],
];

const NEGATED = /\b(?:never|instead of|rather than|do not|don't|not a|is gone|no longer)\b/i;

function gateViolations(markdown: string): string[] {
	const out: string[] = [];
	let exceptionLevel = 0;
	let inFence = false;
	markdown.split('\n').forEach((line, i) => {
		if (/^\s*(?:```|~~~)/.test(line)) inFence = !inFence;
		const heading = inFence ? null : /^(#{1,6})\s+(.*)$/.exec(line);
		if (heading) {
			const level = heading[1].length;
			if (exceptionLevel && level <= exceptionLevel) exceptionLevel = 0;
			if (/exception/i.test(heading[2])) exceptionLevel = level;
			return;
		}
		if (exceptionLevel) return;
		for (const sentence of line.split(/(?<=[.!?])\s+/)) {
			if (NEGATED.test(sentence)) continue;
			for (const [rule, pattern] of DOC_FORBIDDEN) if (pattern.test(sentence)) out.push(`${i + 1}: ${rule}: ${sentence.trim()}`);
		}
	});
	return out;
}

// ── The tests ───────────────────────────────────────────────────────────────

const MCP_GUIDES = ['integration-prompt', 'sdk-auth-prompt', 'feature-flags-prompt', 'billing-prompt', 'team-prompt', 'branding-prompt'];

describe('the 1.0 agent guides teach only what bridge-svelte 1.0 and CLI 1.0 have (TBP-292)', () => {
	it('finds the guides (guards against scanning nothing)', () => {
		for (const name of MCP_GUIDES) expect(guides).toContain(join(REPO, 'mcp', `${name}.md`));
		expect(guides.length).toBeGreaterThan(12);
		expect(COMMANDS.size).toBeGreaterThan(100);
		expect(TOKENS.size).toBeGreaterThan(30);
		// The command check reads real command lines, not nothing.
		expect(invocations(read(join(REPO, 'mcp', 'billing-prompt.md'))).length).toBeGreaterThan(15);
	});

	describe.each(guides.map((file) => [named(file), file]))('%s', (_name, file) => {
		const markdown = read(file);
		it('names no 0.x setting, API or wording', () => expect(banned(markdown)).toEqual([]));
		it('imports only what the package exports', () => expect(badImports(markdown)).toEqual([]));
		it('names only CLI 1.0 commands and options', () => expect(badCommands(markdown)).toEqual([]));
		it('names only theme tokens styles.css has (TBP-831)', () => expect(badTokens(markdown)).toEqual([]));
		it('teaches no direct role, privilege or plan check (TBP-705)', () => expect(gateViolations(markdown)).toEqual([]));
	});

	it.each([['feature-flags-prompt'], ['billing-prompt']])('mcp/%s.md splits its checks into terminal and browser ones (TBP-812)', (name) => {
		const guide = read(join(REPO, 'mcp', `${name}.md`));
		expect(guide).toContain('### Terminal checks');
		expect(guide).toContain('### Browser checks');
		expect(guide).toContain('Heads up: not verified in a browser');
		expect(guide).toContain('If you do not, list them for the developer, numbered');
		expect(guide.indexOf('### Terminal checks')).toBeLessThan(guide.indexOf('### Browser checks'));
	});

	it('the look guide maps the app\'s own styling onto the tokens (TBP-831)', () => {
		const guide = read(join(REPO, 'mcp', 'branding-prompt.md'));
		for (const needed of ['Tailwind', 'custom properties', 'component library', '`bridge`', 'default look', '/auth/sign-in', '/subscription/plan', 'TeamPanel']) expect(guide).toContain(needed);
		expect(read(join(REPO, 'mcp', 'integration-prompt.md'))).toContain('bridge guide svelte branding');
	});

	describe('goes red on a planted bad line', () => {
		it.each([
			'VITE_BRIDGE_APP_ID=your-app-id',
			'bridge app update --ui-url http://localhost:5173',
			'The quota gate is display, not enforcement.',
			'The agent verifies; do not hand this to the developer.',
			"import { FeatureFlag } from '@nebulr-group/bridge-svelte/flags';",
		])('banned: %s', (bad) => expect(banned(bad)).not.toEqual([]));

		it.each([
			"import { TeamManagementPanel } from '@nebulr-group/bridge-svelte';",
			"import { auth, isAuthenticated } from '@nebulr-group/bridge-svelte';",
			"import { protect } from '@nebulr-group/bridge-svelte/server';",
			"import { x } from '@nebulr-group/bridge-svelte/billing';",
		])('import: %s', (bad) => expect(badImports(bad)).not.toEqual([]));

		it.each([
			'Run `bridge app update --ui-url http://localhost:5173`.',
			'Run `bridge app redirect-uris add <url>`.',
			'Run `bridge plan quota set pro --metric seats`.',
			'Run `bridge guide billing-master`.',
			'Run `bridge flag create beta --rule-json x`.',
			'```bash\nbridge app update \\\n  --default-callback-uri http://x\n```',
			'Run `npx @nebulr-group/bridge-cli@alpha check roles`.',
		])('command: %s', (bad) => expect(badCommands(bad)).not.toEqual([]));

		it('token: a misspelt one', () => expect(badTokens('Set `--bridge-primary-colour: red`.')).not.toEqual([]));
	});

	describe('stays green on real lines', () => {
		it.each([
			'Run `bridge app address add https://app.example.com --use browser-origin`.',
			'`bridge plan create pro --name Pro --price "19 EUR/month" --trial-days 14 --limit tickets=100`',
			'`bridge flag create analytics --when "bridge:billing.entitlement.analytics eq true"`',
			'`bridge guide svelte sdk-auth` and `bridge guide decision going-live`',
			'Run `npx @nebulr-group/bridge-cli@alpha check gates`.',
			'It sits in the `bridge` cascade layer.',
			'`bridge --app <id> flag list`',
		])('%s', (good) => expect(badCommands(good)).toEqual([]));
	});
});
