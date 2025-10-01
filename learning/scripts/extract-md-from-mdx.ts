#!/usr/bin/env bun
/**
 * Extracts plain markdown from an MDX file whose sections are wrapped with
 * <Section id="..." title="..."> ... </Section>.
 *
 * Outputs:
 *  - Single combined .md with Section wrappers removed
 *  - Optional: one .md per Section (named {id}.md) if --split is provided
 *
 * Usage:
 *   bun learning/scripts/extract-md-from-mdx.ts <input.mdx> <output.md> [--split --outdir <dir>]
 */

type Section = { id: string; title?: string; content: string };

function parseSections(mdx: string): Section[] {
  const sectionRegex = /<Section\s+([^>]*?)>([\s\S]*?)<\/Section>/g;
  const attrRegex = /([a-zA-Z_:][a-zA-Z0-9_:.-]*)\s*=\s*"([^"]*)"/g;

  const sections: Section[] = [];
  let match: RegExpExecArray | null;

  while ((match = sectionRegex.exec(mdx)) !== null) {
    const attrStr = match[1] ?? '';
    const inner = match[2] ?? '';

    let id: string | undefined;
    let title: string | undefined;
    let a: RegExpExecArray | null;
    while ((a = attrRegex.exec(attrStr)) !== null) {
      const key = a[1];
      const val = a[2];
      if (key === 'id') id = val;
      else if (key === 'title') title = val;
    }
    if (!id) {
      throw new Error('Section missing required id attribute');
    }

    const cleaned = inner
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .trim();

    sections.push({ id, title, content: cleaned });
  }
  return sections;
}

function stripGlobalFrontmatter(mdx: string): { frontmatter: string; body: string } {
  const fm = /^---[\s\S]*?---\n?/;
  const m = mdx.match(fm);
  if (m) {
    const frontmatter = m[0];
    const body = mdx.slice(m[0].length);
    return { frontmatter, body };
  }
  return { frontmatter: '', body: mdx };
}

function buildCombinedMarkdown(frontmatter: string, sections: Section[]): string {
  const parts: string[] = [];
  if (frontmatter) {
    parts.push('<!-- frontmatter preserved from MDX -->');
  }
  for (const s of sections) {
    if (s.title) {
      parts.push(`\n\n## ${s.title}\n`);
    }
    parts.push(s.content);
  }
  return parts.join('\n').trim() + '\n';
}

function usage(): never {
  console.error('Usage: bun learning/scripts/extract-md-from-mdx.ts <input.mdx> <output.md> [--split --outdir <dir>]');
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) usage();
  const input = args[0];
  const output = args[1];
  let split = false;
  let outdir = '';

  for (let i = 2; i < args.length; i++) {
    const a = args[i];
    if (a === '--split') split = true;
    else if (a === '--outdir') {
      outdir = args[++i] ?? '';
    }
  }

  const mdx = await Bun.file(input).text();
  const { frontmatter, body } = stripGlobalFrontmatter(mdx);
  const sections = parseSections(body);

  await Bun.write(output, buildCombinedMarkdown(frontmatter, sections));

  if (split) {
    if (!outdir) {
      console.error('When using --split, you must provide --outdir <dir>');
      process.exit(1);
    }
    await Bun.write(outdir + '/_index.md', buildCombinedMarkdown(frontmatter, sections));
    for (const s of sections) {
      const name = s.id.replace(/[^a-z0-9_-]/gi, '-');
      const titleHeader = s.title ? `\n\n# ${s.title}\n` : '';
      await Bun.write(`${outdir}/${name}.md`, (titleHeader + s.content + '\n').trim() + '\n');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env bun
/**
 * Extracts plain markdown from an MDX file whose sections are wrapped with
 * <Section id="..." title="..."> ... </Section>.
 *
 * Outputs:
 *  - Single combined .md with Section wrappers removed
 *  - Optional: one .md per Section (named {id}.md) if --split is provided
 *
 * Usage:
 *   bun scripts/extract-md-from-mdx.ts <input.mdx> <output.md> [--split --outdir <dir>]
 */

type Section = { id: string; title?: string; content: string };

function parseSections(mdx: string): Section[] {
  const sectionRegex = /<Section\s+([^>]*?)>([\s\S]*?)<\/Section>/g;
  const attrRegex = /([a-zA-Z_:][a-zA-Z0-9_:.-]*)\s*=\s*"([^"]*)"/g;

  const sections: Section[] = [];
  let match: RegExpExecArray | null;

  while ((match = sectionRegex.exec(mdx)) !== null) {
    const attrStr = match[1] ?? '';
    const inner = match[2] ?? '';

    let id: string | undefined;
    let title: string | undefined;
    let a: RegExpExecArray | null;
    while ((a = attrRegex.exec(attrStr)) !== null) {
      const key = a[1];
      const val = a[2];
      if (key === 'id') id = val;
      else if (key === 'title') title = val;
    }
    if (!id) {
      throw new Error('Section missing required id attribute');
    }

    const cleaned = inner
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .trim();

    sections.push({ id, title, content: cleaned });
  }
  return sections;
}

function stripGlobalFrontmatter(mdx: string): { frontmatter: string; body: string } {
  const fm = /^---[\s\S]*?---\n?/;
  const m = mdx.match(fm);
  if (m) {
    const frontmatter = m[0];
    const body = mdx.slice(m[0].length);
    return { frontmatter, body };
  }
  return { frontmatter: '', body: mdx };
}

function buildCombinedMarkdown(frontmatter: string, sections: Section[]): string {
  const parts: string[] = [];
  if (frontmatter) {
    parts.push('<!-- frontmatter preserved from MDX -->');
  }
  for (const s of sections) {
    if (s.title) {
      parts.push(`\n\n## ${s.title}\n`);
    }
    parts.push(s.content);
  }
  return parts.join('\n').trim() + '\n';
}

function usage(): never {
  console.error('Usage: bun scripts/extract-md-from-mdx.ts <input.mdx> <output.md> [--split --outdir <dir>]');
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) usage();
  const input = args[0];
  const output = args[1];
  let split = false;
  let outdir = '';

  for (let i = 2; i < args.length; i++) {
    const a = args[i];
    if (a === '--split') split = true;
    else if (a === '--outdir') {
      outdir = args[++i] ?? '';
    }
  }

  const mdx = await Bun.file(input).text();
  const { frontmatter, body } = stripGlobalFrontmatter(mdx);
  const sections = parseSections(body);

  await Bun.write(output, buildCombinedMarkdown(frontmatter, sections));

  if (split) {
    if (!outdir) {
      console.error('When using --split, you must provide --outdir <dir>');
      process.exit(1);
    }
    await Bun.write(outdir + '/_index.md', buildCombinedMarkdown(frontmatter, sections));
    for (const s of sections) {
      const name = s.id.replace(/[^a-z0-9_-]/gi, '-');
      const titleHeader = s.title ? `\n\n# ${s.title}\n` : '';
      await Bun.write(`${outdir}/${name}.md`, (titleHeader + s.content + '\n').trim() + '\n');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


