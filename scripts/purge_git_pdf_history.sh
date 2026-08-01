#!/usr/bin/env bash
# Script: purge_git_pdf_history.sh
# Purpose: Completely purge all binary textbook PDFs in `ml_backend/my_pdfs/` from git commit history.
#
# IMPORTANT:
# 1. Back up your repository before running history rewrites.
# 2. Ensure python3 and git-filter-repo are installed: `pip install git-filter-repo`
# 3. Running this script rewrites commit hashes across git history.
# 4. A force push (`git push origin --force --all`) is required after execution to update remote branches.

set -euo pipefail

echo "==============================================================="
echo "       Git History Purge Script — Textbook PDF Removal        "
echo "==============================================================="

if ! command -v git-filter-repo &> /dev/null; then
    echo "[!] git-filter-repo is not installed. Installing via pip..."
    pip install git-filter-repo
fi

echo "[1/3] Verifying clean git working tree..."
if [[ -n $(git status --porcelain) ]]; then
    echo "[ERROR] Working tree has uncommitted changes. Please commit or stash before purging history."
    exit 1
fi

echo "[2/3] Executing git filter-repo to remove ml_backend/my_pdfs/..."
git filter-repo --path ml_backend/my_pdfs --invert-paths --force

echo "[3/3] Verifying PDF purge..."
if git log --all -- "ml_backend/my_pdfs/*" | grep -q "commit"; then
    echo "[!] Warning: PDF objects may still exist in reflogs or unreachable commits."
else
    echo "[SUCCESS] ml_backend/my_pdfs/ purged from all commit history!"
fi

echo ""
echo "Next step (if pushing to remote):"
echo "  git push origin --force --all"
echo "  git push origin --force --tags"
echo "==============================================================="
