# Authoring and Extracting MDX Docs

This directory contains MDX sources that can be rendered in Astro Starlight (with Svelte) and also exported as plain Markdown for GitLab or obridger destinations.

## Structure

- `learning/mdx/` — Authoring MDX files with `<Section>` wrappers
- `learning/md/` — Plain Markdown outputs (checked-in or generated)
- `learning/scripts/` — Utilities (MDX → MD extractor)

## Authoring

- Write docs in `.mdx` and wrap logical chunks in `<Section id="..." title="..."> ... </Section>`.
- Import a no-op `Section` component when rendering in environments that need it. In Starlight you can map it to any wrapper.

Example: see `learning/mdx/quickstart.mdx`.

## Extracting plain .md

Use bridge extractor to generate a combined `.md` and, optionally, split per-section files:

```bash
# Single combined .md
bun learning/scripts/extract-md-from-mdx.ts learning/mdx/quickstart.mdx learning/md/quickstart.md

# Combined + per-section files into a directory
mkdir -p learning/md/quickstart
bun learning/scripts/extract-md-from-mdx.ts learning/mdx/quickstart.mdx learning/md/quickstart/_all.md --split --outdir learning/md/quickstart
```

Outputs:
- `_all.md` (combined, Section tags stripped)
- `{section-id}.md` for each `<Section id>` when using `--split`

## Consuming in Astro Starlight

- Import `learning/mdx/quickstart.mdx` directly where rich composition is needed.
- Or import per-section `.md` files (generated) to place content across pages.


