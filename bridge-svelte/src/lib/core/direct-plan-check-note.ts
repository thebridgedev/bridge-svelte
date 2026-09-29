// TBP-705 — in development, say once that a direct plan-feature check is the
// exception, not the standard.
//
// The rule for app code: every gate is a flag, and a feature a plan sells is a
// flag ruled `bridge:billing.entitlement.<key> eq true`. `<Entitled to>` and
// `$entitlements.can(key)` read the plan's feature list directly. They work and
// stay supported for the rare case where the developer asks for no flag, so
// they are not deprecated — but an AI agent or a developer who reaches for them
// by habit should hear, once, what the standard is.
//
// Once per page load (module scope), development builds only: in production
// nothing is printed.

let noted = false;

function isDevBuild(): boolean {
  try {
    return import.meta.env.DEV === true;
  } catch {
    return false;
  }
}

/** A direct plan-feature check ran. `form` is how the app wrote it. */
export function noteDirectPlanCheck(form: 'entitled' | 'can', key: string): void {
  if (noted || !isDevBuild()) return;
  noted = true;
  const written = form === 'entitled' ? `<Entitled to="${key}">` : `$entitlements.can('${key}')`;
  console.info(
    `[bridge] ${written} checks the plan directly. The standard is a flag ruled on ` +
      `bridge:billing.entitlement.${key} — see "npx @nebulr-group/bridge-cli check gates". ` +
      `(Development only — this note is not shown in production.)`,
  );
}

/** Test hook: allow the note to print again. */
export function __resetDirectPlanCheckNote(): void {
  noted = false;
}
