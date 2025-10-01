#!/usr/bin/env bun
/**
 * Converts all MDX files in a directory to plain markdown, ignoring 'components' subdirectories.
 *
 * Usage:
 *   bun learning/scripts/extract-md-from-mdx.ts <input-dir> <output-dir>
 */
import { Glob } from 'bun';
import fs from 'fs/promises';
import { mdxToMd } from 'mdx-to-md';
import path from 'path';

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: bun learning/scripts/extract-md-from-mdx.ts <input-dir> <output-dir>');
    process.exit(1);
  }

  const inputDir = args[0];
  const outputDir = args[1];

  try {
    const glob = new Glob('**/*.mdx');
    const files = await Array.fromAsync(glob.scan(inputDir));

    const mdxFiles = files.filter(
      (file) => !file.split(path.sep).includes('components')
    );

    if (mdxFiles.length === 0) {
      console.log(`No .mdx files found in ${inputDir} (excluding 'components' directories)`);
      return;
    }

    for (const relativePath of mdxFiles) {
      const inputPath = path.join(inputDir, relativePath);
      const outputFilename = relativePath.replace(/\.mdx$/, '.md');
      const outputPath = path.join(outputDir, outputFilename);

      // Ensure the output subdirectory exists
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      
      const absoluteInputPath = path.resolve(inputPath);
      let markdownContent = await mdxToMd(absoluteInputPath);
      
      // Clean up residual frontmatter-like lines
      markdownContent = markdownContent
        .replace(/^---\s*$/m, '')
        .replace(/^## title:.*$/m, '')
        .trim();

      await Bun.write(outputPath, markdownContent);
      console.log(`✅ Converted ${inputPath} -> ${outputPath}`);
    }

  } catch (err) {
    console.error(`Error during conversion:`, err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


