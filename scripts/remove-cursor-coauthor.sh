#!/usr/bin/env bash
# Remove "Co-authored-by: Cursor <cursoragent@cursor.com>" from all commit messages.
# Run from repo root: ./scripts/remove-cursor-coauthor.sh
#
# WARNING: Rewrites history (new hashes). Force-push required. Coordinate with others.

set -e
cd "$(git rev-parse --show-toplevel)"

git filter-branch -f --msg-filter 'sed "/Co-authored-by: Cursor <cursoragent@cursor.com>/d"' --tag-name-filter cat -- --all

echo ""
echo "Done. To update remote:"
echo "  git push origin --force --all"
echo "  git push origin --force --tags"
