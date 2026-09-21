#!/usr/bin/env bash
#
# Static sweep for `networkidle` waits in the Playwright suite. (Origin: TBP-605.)
#
# Why it matters: the demo holds a persistent Centrifugo WebSocket, so the
# network never goes idle. `waitForLoadState('networkidle')` therefore cannot
# resolve on any page the SDK has booted on — it burns the whole 60s test
# budget and reports as `Test timeout of 60000ms exceeded`, with the real cause
# one frame away. Eight subscription specs failed this way, all of them parked
# on the same call. Playwright's own docs discourage it for exactly this reason.
#
# Fix a hit with the wait that says what the test is actually waiting for:
#
#     await expect(page.locator('[data-bridge-plan-selector]')).toBeVisible(...)
#     await expect(selector).not.toHaveAttribute('data-loading', 'true', ...)
#     await page.waitForURL((url) => url.pathname === '/welcome', ...)
#     await page.waitForResponse((r) => r.url().includes('/flags/'))
#     await page.waitForLoadState('domcontentloaded')   // when only the document matters
#
# Escape hatch: append `ALLOW-NETWORKIDLE` as a trailing comment on the line, for
# the rare page that genuinely holds no socket and where idleness is the thing
# under test. A survivor must also carry a comment saying why.

set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

SCAN_ROOTS=("e2e")

# Quoted on purpose: this catches the calls — waitForLoadState('networkidle'),
# { waitUntil: "networkidle" } — while leaving prose that merely names the state
# alone, so a spec can explain why it does NOT use one.
PATTERN="['\"]networkidle['\"]"

# This script spells the forbidden state out on purpose.
EXCLUDES=(
  ':!scripts/check-no-networkidle.sh'
)

hits=""
for root in "${SCAN_ROOTS[@]}"; do
  [ -d "$root" ] || continue
  found=$(git grep --untracked -nIE "$PATTERN" -- "$root" "${EXCLUDES[@]}" 2>/dev/null | grep -v 'ALLOW-NETWORKIDLE' || true)
  [ -n "$found" ] && hits="${hits}${found}"$'\n'
done

hits=$(printf '%s' "$hits" | sed '/^$/d')

if [ -n "$hits" ]; then
  echo "" >&2
  echo "✗ networkidle wait(s) found:" >&2
  echo "" >&2
  printf '%s\n' "$hits" | sed 's/^/    /' >&2
  echo "" >&2
  echo "  The demo keeps a Centrifugo WebSocket open, so the network never goes" >&2
  echo "  idle — this wait cannot resolve and will time out the whole test." >&2
  echo "  Wait for what the test actually needs instead:" >&2
  echo "" >&2
  echo "      await expect(locator).toBeVisible({ timeout: MED_TIMEOUT });" >&2
  echo "      await expect(el).not.toHaveAttribute('data-loading', 'true', ...);" >&2
  echo "      await page.waitForURL((url) => url.pathname === '/welcome', ...);" >&2
  echo "      await page.waitForLoadState('domcontentloaded');" >&2
  echo "" >&2
  echo "  If idleness is genuinely the thing under test, append a trailing" >&2
  echo "  'ALLOW-NETWORKIDLE' comment on that line and say why." >&2
  echo "" >&2
  exit 1
fi

echo "✓ No networkidle waits under: ${SCAN_ROOTS[*]}"
