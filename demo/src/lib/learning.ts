/**
 * Build-time loader for the plugin's `/learning` docs.
 *
 * The demo app and `bridge-svelte/learning/*.md` live in the SAME repo, so we
 * import the markdown directly at build time — no network, no fetch. This is the
 * exact same source of truth the public Astro docs hub renders via the
 * `sync-docs` GitHub Action. Authored once, two renderers (see demo/INTEGRATION.md).
 *
 * Rule: the demo never hard-codes a snippet that could live in `/learning` — code
 * shown in the feature-page template is pulled from here, so it can never drift
 * from the maintained docs.
 */

export interface CodeBlock {
	lang: string;
	code: string;
}

export interface PropRow {
	/** Raw markdown cell text (render with {@html inlineMd(...)}). */
	name: string;
	type: string;
	default?: string;
	description: string;
}

export interface DocSection {
	title: string;
	anchor: string;
	level: number;
	/** Prose (paragraphs/lists) rendered to lightweight HTML — no code/tables. */
	html: string;
	/** Fenced code blocks in this section, in document order. */
	code: CodeBlock[];
	/** First markdown table in the section, parsed as prop rows (else null). */
	props: PropRow[] | null;
	/** Raw markdown body of the section (heading excluded). */
	raw: string;
}

export interface LearningDoc {
	slug: string;
	frontmatter: {
		title?: string;
		order?: number;
		oneLiner?: string;
		related?: string[];
		[k: string]: unknown;
	};
	/** Title from frontmatter, else the first `#` heading. */
	title: string;
	/** Intro prose before the first section heading (rendered HTML). */
	introHtml: string;
	sections: DocSection[];
	byAnchor: Record<string, DocSection>;
}

// ── Eager, raw import of every learning markdown file ─────────────────────────
// Path is relative to this file: demo/src/lib → ../../../learning (= bridge-svelte/learning).
const rawFiles = import.meta.glob('../../../learning/**/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const docs: Record<string, LearningDoc> = {};
for (const [path, content] of Object.entries(rawFiles)) {
	const parts = path.split('/');
	const li = parts.indexOf('learning');
	const after = parts.slice(li + 1);
	// learning/<topic>/<file>.md → slug = <topic>; learning/<file>.md → filename.
	const slug = after.length > 1 ? after[0] : after[0].replace(/\.md$/, '');
	docs[slug] = parseDoc(slug, content);
}

/** Resolve a topic doc by slug (folder name), e.g. `getDoc('feature-flags')`. */
export function getDoc(slug: string): LearningDoc | undefined {
	return docs[slug];
}

/** Find a section by anchor or by case-insensitive title substring. */
export function section(doc: LearningDoc | undefined, query: string): DocSection | undefined {
	if (!doc) return undefined;
	const exact = doc.byAnchor[slugify(query)];
	if (exact) return exact;
	const q = query.toLowerCase();
	return doc.sections.find((s) => s.title.toLowerCase().includes(q));
}

// ── Parsing ───────────────────────────────────────────────────────────────────

function parseDoc(slug: string, raw: string): LearningDoc {
	const { data, body } = splitFrontmatter(raw);
	const lines = body.split('\n');

	let title = (data.title as string | undefined) ?? undefined;
	const sections: DocSection[] = [];
	const introLines: string[] = [];
	let cur: { title: string; level: number; lines: string[] } | null = null;
	let inFence = false;

	const flush = () => {
		if (cur) sections.push(buildSection(cur.title, cur.level, cur.lines.join('\n')));
	};

	for (const line of lines) {
		if (/^```/.test(line)) inFence = !inFence;
		const h = !inFence ? line.match(/^(#{1,3})\s+(.*)$/) : null;
		if (h) {
			const level = h[1].length;
			const text = stripInline(h[2].trim());
			if (level === 1) {
				if (!title) title = text;
				continue;
			}
			flush();
			cur = { title: text, level, lines: [] };
			continue;
		}
		(cur ? cur.lines : introLines).push(line);
	}
	flush();

	const byAnchor: Record<string, DocSection> = {};
	for (const s of sections) byAnchor[s.anchor] = s;

	return {
		slug,
		frontmatter: data,
		title: title ?? slug,
		introHtml: renderProse(introLines.join('\n')),
		sections,
		byAnchor
	};
}

function buildSection(title: string, level: number, body: string): DocSection {
	const code: CodeBlock[] = [];
	const proseLines: string[] = [];
	let props: PropRow[] | null = null;

	const lines = body.split('\n');
	let i = 0;
	while (i < lines.length) {
		const fence = lines[i].match(/^```(\w*)/);
		if (fence) {
			const lang = fence[1] || '';
			const buf: string[] = [];
			i++;
			while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
			i++; // skip closing fence
			code.push({ lang, code: buf.join('\n') });
			continue;
		}
		if (/^\s*\|/.test(lines[i])) {
			const buf: string[] = [];
			while (i < lines.length && /^\s*\|/.test(lines[i])) buf.push(lines[i++]);
			if (!props) props = parseTable(buf);
			continue;
		}
		proseLines.push(lines[i++]);
	}

	return {
		title,
		level,
		anchor: slugify(title),
		html: renderProse(proseLines.join('\n')),
		code,
		props,
		raw: body
	};
}

function parseTable(rows: string[]): PropRow[] | null {
	if (rows.length < 2) return null;
	const cells = (r: string) =>
		r
			.trim()
			.replace(/^\|/, '')
			.replace(/\|$/, '')
			.split('|')
			.map((c) => c.trim());
	const header = cells(rows[0]).map((h) => h.toLowerCase());
	const find = (...keys: string[]) => header.findIndex((h) => keys.some((k) => h.includes(k)));
	const iName = find('prop', 'name', 'field');
	const iType = find('type');
	const iDef = find('default');
	const iDesc = find('desc');
	const out: PropRow[] = [];
	// row 0 = header, row 1 = separator (---), data starts at 2.
	for (let r = 2; r < rows.length; r++) {
		const c = cells(rows[r]);
		if (c.every((x) => x === '')) continue;
		out.push({
			name: c[iName] ?? '',
			type: iType >= 0 ? (c[iType] ?? '') : '',
			default: iDef >= 0 ? c[iDef] : undefined,
			description: iDesc >= 0 ? (c[iDesc] ?? '') : ''
		});
	}
	return out.length ? out : null;
}

function splitFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
	const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
	if (!m) return { data: {}, body: raw };
	return { data: parseYamlLite(m[1]), body: raw.slice(m[0].length) };
}

function parseYamlLite(src: string): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const line of src.split('\n')) {
		const m = line.match(/^(\w[\w-]*):\s*(.*)$/);
		if (!m) continue;
		const key = m[1];
		let val = m[2].trim();
		if (val === '') continue;
		if (/^\[.*\]$/.test(val)) {
			out[key] = val
				.slice(1, -1)
				.split(',')
				.map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
				.filter(Boolean);
		} else if (/^\d+$/.test(val)) {
			out[key] = Number(val);
		} else {
			out[key] = val.replace(/^['"]|['"]$/g, '');
		}
	}
	return out;
}

// ── Lightweight markdown rendering ──────────────────────────────────────────────

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Inline markdown → HTML: `code`, **bold**, _italic_, [text](url). */
export function inlineMd(s: string): string {
	return escapeHtml(s)
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function stripInline(s: string): string {
	return s
		.replace(/`/g, '')
		.replace(/\*\*/g, '')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.trim();
}

/** Block markdown → HTML: paragraphs + unordered/ordered lists (no code/tables). */
function renderProse(md: string): string {
	const trimmed = md.trim();
	if (!trimmed) return '';
	return trimmed
		.split(/\n{2,}/)
		.map((block) => {
			const lines = block.split('\n').filter((l) => l.trim() !== '');
			if (!lines.length) return '';
			if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
				return `<ul>${lines.map((l) => `<li>${inlineMd(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`;
			}
			if (lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
				return `<ol>${lines.map((l) => `<li>${inlineMd(l.replace(/^\s*\d+\.\s+/, ''))}</li>`).join('')}</ol>`;
			}
			return `<p>${inlineMd(block.trim())}</p>`;
		})
		.join('\n');
}

function slugify(s: string): string {
	return stripInline(s)
		.toLowerCase()
		.replace(/[^\w]+/g, '-')
		.replace(/^-|-$/g, '');
}
