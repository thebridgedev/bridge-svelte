// TBP-705 — the guides this repo serves to AI agents (mcp/, learning/, README.md,
// read from GitHub main by the Bridge MCP server) must not teach what the rule
// forbids. The owner's rule (2026-09-29): every gate in app code is a flag, and
// its rule says why — a privilege, a plan feature
// (`bridge:billing.entitlement.<key> eq true`) or a rollout. App code never reads
// a role, a privilege list, the plan or a plan feature to decide what someone may
// see or do. Browser-only counting is a complete, first-class way to run limits.
//
// A sentence that tells the reader NOT to do it is allowed, and so is anything
// in the one section a guide may have whose heading says "Exceptions".
//
// The pattern list, the negation list and the Exceptions scoping MIRROR
// bridge-cli `src/gate-rules.ts` (DOC_FORBIDDEN / docGateViolations), which is
// the source of truth and also drives `bridge check gates`. Keep them the same:
// change it there first, then copy it here.
//
// Lives in src/ (not src/lib) so svelte-package never copies it into dist.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// ── Mirror of bridge-cli src/gate-rules.ts (docs part) ──────────────────────

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
  ['a plan name compared in code', /\.plan(?:Key|Name|Slug)?\s*(?:===|!==|==|!=)\s*['"`]/],
  ['a plan name compared in code', /\bplan(?:Key|Name|Slug)?\s*(?:===|!==|==|!=)\s*['"`]/i],
  ['a plan-name helper', /\bis(?:Pro|Free|Enterprise|Team|Business)(?:Plan|User)?\b\s*[(=]/],
  ['a route rule on plans', /\bplans\s*:\s*\[/],
  ['a route rule on a role', /\{[^}\n]*\b(?:match|path)\s*:[^}\n]*\brole\s*:\s*['"`]/],
  ['a route rule on a privilege', /\bprivilege\s*:\s*['"`](?!ANONYMOUS|AUTHENTICATED)[A-Z_]+['"`]/],
  ['a flag rule that names plans', /"attribute"\s*:\s*"(?:tenant\.plan|bridge:billing\.plan)"/],
  ['browser counting called demo-grade', /demo[- ]grade/i],
  ['browser counting called display only', /display,? not enforcement/i],
  ['browser counting said unable to refuse', /only (?:a|the|your) backend can (?:refuse|enforce|stop)/i],
  [
    'browser counting said not to work',
    /\b(?:browser|frontend|client)(?:[- ](?:only|side))?\b[^.\n]{0,40}\b(?:won't|will not|does not|doesn't|cannot|can't|can not) (?:work|enforce|be trusted)/i,
  ],
  ['browser counting said not production-ready', /\b(?:browser|frontend|client)\b[^.\n]{0,60}\bnot (?:production|prod)[- ](?:ready|grade)/i],
  ['privileges said to match as text', /\b(?:matched|matches|match) (?:privilege keys )?as text\b|\bno other (?:privilege )?key contains\b/i],
];

/** A sentence that tells the reader NOT to do the forbidden thing. */
const NEGATED = /\b(?:never|instead of|rather than|do not|don't|not a|is gone|no longer)\b/i;

const HEADING = /^(#{1,6})\s+(.*)$/;

type DocViolation = { line: number; rule: string; text: string };

function docGateViolations(markdown: string): DocViolation[] {
  const out: DocViolation[] = [];
  let exceptionLevel = 0;
  let inFence = false;
  markdown.split('\n').forEach((line, i) => {
    if (/^\s*(?:```|~~~)/.test(line)) inFence = !inFence;
    const heading = inFence ? null : HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      if (exceptionLevel && level <= exceptionLevel) exceptionLevel = 0;
      if (/exception/i.test(heading[2])) exceptionLevel = level;
      return;
    }
    if (exceptionLevel) return;
    for (const sentence of line.split(/(?<=[.!?])\s+/)) {
      if (NEGATED.test(sentence)) continue;
      for (const [rule, pattern] of DOC_FORBIDDEN) {
        if (pattern.test(sentence)) out.push({ line: i + 1, rule, text: sentence.trim() });
      }
    }
  });
  return out;
}

// ── This repo's agent-facing docs ───────────────────────────────────────────

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return name.endsWith('.md') ? [path] : [];
  });
}

const read = (file: string) => readFileSync(file, 'utf8');
const agentDocs = [...markdownFiles(join(REPO, 'mcp')), ...markdownFiles(join(REPO, 'learning')), join(REPO, 'README.md')];

describe('no agent-facing guide teaches a direct role, privilege or plan check, or talks browser counting down — TBP-705', () => {
  it('finds the guides (guards against scanning nothing)', () => {
    expect(agentDocs.length).toBeGreaterThan(10);
    expect(agentDocs).toContain(join(REPO, 'mcp', 'billing-prompt.md'));
  });

  it.each(agentDocs.map((f) => [relative(REPO, f), f]))('%s', (_name, file) => {
    expect(docGateViolations(read(file))).toEqual([]);
  });

  // Owner 2026-09-29: the trust trade-off of browser counting belongs to human
  // docs only. mcp/ and learning/ are served to agents; the README may say it once.
  it('the browser-counting trust trade-off is not in mcp/ or learning/, and at most once in the README', () => {
    const TRADE_OFF = /trusts the browser|could report less than/i;
    const inAgentGuides = agentDocs
      .filter((f) => f !== join(REPO, 'README.md'))
      .filter((f) => TRADE_OFF.test(read(f)))
      .map((f) => relative(REPO, f));
    expect(inAgentGuides).toEqual([]);
    expect(read(join(REPO, 'README.md')).match(new RegExp(TRADE_OFF.source, 'gi'))?.length ?? 0).toBeLessThanOrEqual(1);
  });

  describe('goes red on a planted bad line', () => {
    it.each([
      'For admin-only pages, add a role check on the page: `if (user.role === "ADMIN")`.',
      "Gate the page with `{#if $auth.user.role == 'ADMIN'}`.",
      "Put `@RequireRole('ADMIN')` on the handler.",
      'Check the role in the component before rendering the button.',
      "Show analytics when `tenant.plan === 'pro'`.",
      "if (plan === 'pro') showAnalytics();",
      'const isPro = subscription.plan.key === "pro";',
      '{ "conditions": [{ "attribute": "tenant.plan", "operator": "eq", "values": ["pro"] }] }',
      'Wrap the chart in `<Entitled to="analytics">`.',
      "Show the button when `$entitlements.can('exports')`.",
      "Put `@RequireEntitlement('analytics')` on the handler.",
      "const canManageTeam = ['OWNER', 'ADMIN'].includes(role);",
      "Show the link when `privileges.includes('USER_WRITE')`.",
      "{ path: '/reports/*', privilege: 'REPORTS_VIEW' }",
      "{ path: '/reports/*', privilege: 'AUTHENTICATED', plans: ['pro'] }",
      'Browser counting is display, not enforcement.',
      'Only a backend can refuse a click over the limit.',
      'Offer "Browser only (demo-grade)" as the last option.',
      'A frontend-only app cannot enforce a limit.',
      'Counting in the browser is not production-ready.',
    ])('%s', (bad) => {
      expect(docGateViolations(bad)).not.toEqual([]);
    });

    it('and in a real guide file, not only in isolation', () => {
      const planted = `${read(join(REPO, 'mcp', 'team-prompt.md'))}\nShow the Team link when \`['OWNER','ADMIN'].includes(role)\`.\n`;
      const found = docGateViolations(planted);
      expect(found.length).toBeGreaterThan(0);
      for (const v of found) expect(v.text).toContain("['OWNER','ADMIN'].includes(role)");
    });
  });

  describe("stays green on the rule's own sentences", () => {
    it.each([
      '**Every gate in app code is a flag.** A link, a page, a button, an endpoint: if some people get it and others do not, the code asks a flag, and the flag\'s rule says why: a privilege (`privileges contains "USER_WRITE"`), a plan feature (`bridge:billing.entitlement.analytics eq true`) or a rollout.',
      'App code never reads a role, a privilege list, the plan or a plan feature to decide what someone may see or do.',
      'Control it with a flag rule, never with a role check written into the app\'s code.',
      'Never gate the Team link with `[\'OWNER\',\'ADMIN\'].includes(role)`.',
      'A role rule (`user.role eq "ADMIN"`) is fine when the developer means the role itself.',
      "{ match: '/admin/*', featureFlag: 'admin-area', redirectTo: '/' }",
      "{ path: '/health', privilege: 'ANONYMOUS' }",
      'Browser-only counting is a first-class, complete way to run limits.',
      'Never describe browser counting as demo-grade.',
    ])('%s', (good) => {
      expect(docGateViolations(good)).toEqual([]);
    });

    it('a direct plan-feature check inside the Exceptions section, and only there', () => {
      const guide = [
        '## Gating',
        'Use `<FeatureFlag key="analytics">`.',
        '## Exceptions',
        'When the developer asks for no flag, `<Entitled to="analytics">` reads the plan directly.',
        '### Details',
        "`$entitlements.can('analytics')` is the same check in script.",
        '## Next',
        'Wrap it in `<Entitled to="analytics">`.',
      ].join('\n');
      expect(docGateViolations(guide).map((v) => v.line)).toEqual([8]);
    });
  });
});
