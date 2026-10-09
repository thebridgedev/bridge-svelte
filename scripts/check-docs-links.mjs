#!/usr/bin/env node
// Docs link check for learning/ (OPS-71). Dependency-free; runs in well under a second.
//
// learning/ is copied to thebridge.dev/docs by the docs sync (.github/actions/sync-docs, then
// bridge-web's process-synced-docs.ts). A link that works on GitHub can still 404 on the site, so
// this checks every markdown link the way the sync will publish it:
//
//   relative .md links   the file must exist, any #anchor must match a heading in it, and the
//                        sync must be able to rewrite the link to that file's own site page.
//                        The sync rewrites `[..](<topic>/<file>.md)` (any number of leading ../)
//                        and `[..](<file>.md)`; it cannot rewrite a link that names two or more
//                        folders, so a page nested two folders deep is linked by its site path.
//   other relative links the sync publishes .md pages only, so a link to any other file 404s.
//   site paths           `/<section>/...` (or `/docs/<section>/...`) must be a real docs page:
//                        listed in scripts/docs-site-pages.txt, or a page this repo's own
//                        learning/ produces.
//   #anchors             on the same page must match a heading.
// README.md files are not published and not checked. External links (http:, mailto:, ...) are
// not checked either. Code blocks and inline code are skipped.
//
// How the sync maps files to pages (keep in step with bridge-web process-synced-docs.ts):
//   mechanisms.md                    -> /mechanisms/<tech>/
//   auth/auth.md, auth/anything.md   -> /auth/<tech>/
//   auth/ui/passkeys.md              -> /auth/ui/passkeys/<tech>/
//   auth/logout/logout.md            -> /auth/logout/<tech>/
// and every page also gets a section index at /<topic>/.
//
// Usage:
//   node scripts/check-docs-links.mjs [learning-dir]
//   node scripts/check-docs-links.mjs --print-site-pages <bridge-web>/bridge-docs/src/content/docs
//       prints a fresh scripts/docs-site-pages.txt from the site's docs content.
// Exits 1 when a link is broken.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

function walk(dir, skipReadme = false, out = []) {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, e.name);
		if (e.isDirectory()) walk(p, skipReadme, out);
		else if (/\.mdx?$/.test(e.name) && !(skipReadme && e.name === 'README.md')) out.push(p);
	}
	return out;
}
const toPosix = (p) => p.split(sep).join('/');

if (args[0] === '--print-site-pages') {
	const root = resolve(args[1] || '');
	if (!args[1] || !existsSync(root)) {
		console.error('usage: --print-site-pages <bridge-web>/bridge-docs/src/content/docs');
		process.exit(2);
	}
	const pages = walk(root)
		.map((f) => toPosix(relative(root, f)).replace(/\.mdx?$/, ''))
		.map((r) => (r === 'index' ? '/' : '/' + r.replace(/\/index$/, '') + '/'))
		.sort();
	console.log('# Real thebridge.dev/docs pages (paths below /docs), for scripts/check-docs-links.mjs.');
	console.log('# Regenerate: node scripts/check-docs-links.mjs --print-site-pages <bridge-web>/bridge-docs/src/content/docs');
	for (const p of pages) console.log(p);
	process.exit(0);
}

const LEARNING = resolve(args[0] || join(HERE, '..', 'learning'));
if (!existsSync(LEARNING)) {
	console.error(`check-docs-links: no docs folder at ${LEARNING}`);
	process.exit(2);
}

// The page a learning file is published as (see the table above).
function topicOf(rel) {
	const parts = rel.replace(/\.mdx?$/, '').split('/');
	const base = parts.pop();
	if (parts.length === 0) return base;
	if (parts.length === 1) return parts[0];
	return parts[parts.length - 1] === base ? parts.join('/') : [...parts, base].join('/');
}

// Blank out what is not prose, keeping line numbers: fenced code and HTML comments, and (unless
// keepInline) inline code.
function prose(text, keepInline = false) {
	const blank = (m) => m.replace(/[^\n]/g, ' ');
	const out = text
		.replace(/^( {0,3})(```|~~~)[^\n]*\n[\s\S]*?(\n {0,3}\2[^\n]*|$)/gm, blank)
		.replace(/<!--[\s\S]*?-->/g, blank);
	return keepInline ? out : out.replace(/(`+)[^`\n][\s\S]*?\1/g, blank);
}

// Heading ids as the site makes them (github-slugger, numbered on repeats).
function anchorsOf(text) {
	const ids = new Set();
	const counts = new Map();
	for (const [, raw] of prose(text, true).matchAll(/^ {0,3}#{1,6}[ \t]+(.+?)[ \t#]*$/gm)) {
		const slug = raw
			.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
			.replace(/<[^>]+>/g, '')
			.replace(/[*`]/g, '')
			.toLowerCase()
			.replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
			.replace(/ /g, '-');
		const n = counts.get(slug) || 0;
		counts.set(slug, n + 1);
		ids.add(n ? `${slug}-${n}` : slug);
	}
	return ids;
}

// README.md files are for GitHub: the sync leaves them out (rsync --exclude README.md).
const files = walk(LEARNING, true).map((f) => toPosix(relative(LEARNING, f)));
const fileSet = new Set(files);
const topics = new Set(files.map(topicOf));
const topLevel = new Set(files.filter((f) => !f.includes('/')).map(topicOf));
const texts = new Map(files.map((f) => [f, readFileSync(join(LEARNING, f), 'utf8')]));
const anchorCache = new Map();
const anchors = (f) => {
	if (!anchorCache.has(f)) anchorCache.set(f, anchorsOf(texts.get(f)));
	return anchorCache.get(f);
};

const sitePages = new Set(['/']);
const PAGES_FILE = join(HERE, 'docs-site-pages.txt');
if (existsSync(PAGES_FILE)) {
	for (const l of readFileSync(PAGES_FILE, 'utf8').split('\n')) {
		const p = l.replace(/#.*/, '').trim();
		if (p) sitePages.add(p);
	}
}
for (const t of topics) sitePages.add(`/${t}/`);

// The sync's own rewrite (process-synced-docs.ts rewriteCrossDocLinks), applied to one target.
const SYNC_LINK = /^(?:\.\/)?(?:\.\.\/)*(?:([\w-]+)\/)?([\w-]+)\.mdx?(#.*)?$/;
function syncTopic(target, fromTopic) {
	const m = target.match(SYNC_LINK);
	if (!m) return null;
	const [, dir, base] = m;
	const topic = dir ?? (topLevel.has(base) ? base : fromTopic);
	return topics.has(topic) ? topic : null;
}

// What to write instead, for a link to learning file `to` from learning file `from`.
function suggest(from, to) {
	const depth = to.split('/').length - 1;
	if (depth >= 2) return `/${topicOf(to)}/`;
	return posix.relative(posix.dirname(from), to);
}

// Two files that publish to the same page: the sync keeps one and drops the other.
const byTopic = new Map();
for (const f of files) byTopic.set(topicOf(f), [...(byTopic.get(topicOf(f)) || []), f]);
const collisions = [...byTopic].filter(([, fs]) => fs.length > 1);

const LINK = /(!?)\[(?:[^\][]|\[[^\]]*\])*\]\(\s*<?([^)\s>]+)>?(?:\s+["'(][^)]*)?\)|^ {0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)/gm;
const problems = collisions.map(([t, fs]) => ({
	at: fs.join(', '),
	target: `/${t}/`,
	why: 'these files publish to the same site page; the docs sync keeps only one of them',
}));
let checked = 0;
for (const from of files) {
	const text = prose(texts.get(from));
	const fromTopic = topicOf(from);
	for (const m of text.matchAll(LINK)) {
		const target = m[2] ?? m[3];
		if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) continue;
		checked++;
		const line = text.slice(0, m.index).split('\n').length;
		const report = (why) => problems.push({ at: `${from}:${line}`, target, why });
		const hash = target.indexOf('#');
		const path = hash >= 0 ? target.slice(0, hash) : target;
		const anchor = hash >= 0 ? decodeURIComponent(target.slice(hash + 1)) : '';

		if (path === '') {
			if (anchor && !anchors(from).has(anchor)) report(`no heading "#${anchor}" on this page`);
			continue;
		}
		if (path.startsWith('/')) {
			let p = path.replace(/^\/docs(?=\/|$)/, '').split('?')[0] || '/';
			if (!p.endsWith('/')) p += '/';
			if (!sitePages.has(p))
				report(`not a docs page on the site (/docs${p}); link the page's .md file, or a real section`);
			continue;
		}
		const to = posix.normalize(posix.join(posix.dirname(from), path));
		if (to.startsWith('../')) {
			report('points outside learning/, which the sync does not publish');
			continue;
		}
		if (!/\.mdx?$/.test(to)) {
			const isDir = existsSync(join(LEARNING, to)) && statSync(join(LEARNING, to)).isDirectory();
			report(isDir ? 'links a folder; link its .md file' : 'the docs sync publishes .md pages only; this file is not served');
			continue;
		}
		if (!fileSet.has(to)) {
			report(`no such file (learning/${to})`);
			continue;
		}
		if (anchor && !anchors(to).has(anchor)) report(`no heading "#${anchor}" in learning/${to}`);
		const lands = syncTopic(target, fromTopic);
		const want = topicOf(to);
		if (lands === null) report(`the docs sync cannot rewrite this link, so it 404s on the site; use ${suggest(from, to)}`);
		else if (lands !== want)
			report(`the docs sync sends this to /${lands}/ instead of /${want}/; use ${suggest(from, to)}`);
	}
}

console.log(`check-docs-links: ${checked} links in ${files.length} docs under ${toPosix(relative(process.cwd(), LEARNING)) || '.'}`);
if (!problems.length) {
	console.log('no broken docs links');
	process.exit(0);
}
console.log(`\nBROKEN: ${problems.length} link(s)`);
for (const p of problems) console.log(`  ${p.at}  (${p.target})\n      ${p.why}`);
process.exit(1);
