/**
 * Guard: the declaration files we SHIP must be generated from source, never
 * hand-written next to it (TBP-630).
 *
 * ## What went wrong
 *
 * `src/lib/shared/types/` held both `config.ts` and a hand-written
 * `config.d.ts`. `svelte-package` copies a `.d.ts` it finds in `src/lib`
 * straight through to `dist` instead of emitting one from the sibling `.ts`, so
 * the stale hand-written file WON in the published package. `bridge-svelte@0.6.0`
 * shipped a `BridgeConfig` that declared seven fields and omitted `signupRoute`,
 * `billing`, `locale` and `messages` — and typed `appId` as required, which the
 * real interface does not.
 *
 * The consequence was not cosmetic. TBP-630's documented path — set the language
 * once via `config.locale` — did not compile for a TypeScript consumer:
 *
 *     const c: BridgeConfig = { appId: 'x', locale: 'sv' };
 *     // Object literal may only specify known properties,
 *     // and 'locale' does not exist in type 'BridgeConfig'.
 *
 * The runtime read `locale` correctly the whole time. Only the type lied, which
 * is the worst version of this: everything works until you try to write it down.
 *
 * ## Why the guard is shaped like this
 *
 * The obvious test — assign `{ appId, locale }` to `BridgeConfig` and see it
 * compile — passes against SOURCE and always would have. It cannot see the bug,
 * because the bug is in what packaging chose to copy. So the assertion has to be
 * about the file layout that made packaging choose wrong: under `src/lib`, a
 * `.d.ts` may not sit beside a `.ts` of the same name.
 *
 * Two other files had the same shadow and the same rot: `config.store.d.ts`
 * declared `initConfig` as a free function (it is a method on `bridgeConfig`)
 * and omitted `getRouteGuardConfig` entirely. This was never about one field.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import type { BridgeConfig } from './config.js';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

describe('packaged declarations are generated, not hand-written', () => {
  const files = walk(LIB_ROOT);

  it('finds the lib root it is supposed to be scanning', () => {
    // Without this, a bad path would make every assertion below vacuously true —
    // the guard would report green precisely when it had stopped looking.
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.endsWith('/shared/types/config.ts'))).toBe(true);
  });

  it('has no .d.ts shadowing a sibling .ts anywhere under src/lib', () => {
    const shadowed = files
      .filter((f) => f.endsWith('.d.ts'))
      .filter((f) => files.includes(`${f.slice(0, -'.d.ts'.length)}.ts`))
      .map((f) => f.slice(LIB_ROOT.length + 1));

    // svelte-package copies these verbatim into dist, so whatever they say is
    // what consumers get — regardless of what the .ts next to them says.
    expect(shadowed).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

/**
 * Compile-time half, checked by `svelte-check` in CI.
 *
 * This is the assertion the consumer asked for, and on its own it is NOT the
 * guard — it passed throughout the broken release, because source was always
 * right. It earns its place by covering the other direction: somebody deleting
 * `locale` from `config.ts` rather than packaging shipping the wrong file.
 */
const _localeIsAssignable: BridgeConfig = {
  appId: 'x',
  locale: 'sv',
  messages: { 'login.submit': 'Logga in' },
};

describe('BridgeConfig accepts the documented i18n fields', () => {
  it('compiles and carries them at runtime', () => {
    expect(_localeIsAssignable.locale).toBe('sv');
    expect(_localeIsAssignable.messages?.['login.submit']).toBe('Logga in');
  });
});
