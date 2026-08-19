#!/usr/bin/env bash
# ============================================================
# Trading Flow — one-shot GitHub push
# Run:  bash scripts/push-to-github.sh
# Target repo: git@github.com:zabid-coder/Trading-Flow.git
# Does: git init -> add -> commit -> attach remote -> push
# Requires: an SSH key registered on your GitHub account.
# ============================================================
set -e
REPO_NAME="Trading-Flow"
SSH_URL="git@github.com:zabid-coder/${REPO_NAME}.git"
HTTPS_URL="https://github.com/zabid-coder/${REPO_NAME}.git"
cd "$(dirname "$0")/.."

command -v git >/dev/null 2>&1 || { echo "[X] git not found — install it first."; exit 1; }

# init once, commit everything (re-run safe)
if [ ! -d .git ]; then
  git init -b main
fi
git add .
git commit -m "Trading Flow — Algorithmic Trading Suite" || echo "[i] nothing new to commit"

# pick the remote URL — SSH if reachable, HTTPS otherwise
if git ls-remote "$SSH_URL" >/dev/null 2>&1; then
  REMOTE_URL="$SSH_URL"
  echo "=> using SSH remote: $REMOTE_URL"
else
  REMOTE_URL="$HTTPS_URL"
  echo "=> SSH key not accepted — falling back to HTTPS: $REMOTE_URL"
  echo "   (to use SSH: github.com/settings/keys -> add your ~/.ssh/id_ed25519.pub)"
fi

git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE_URL"

# if the GitHub repo was created with a README/license, sync it first
if ! git push -u origin main; then
  echo "=> push rejected (remote has history) — rebasing then pushing..."
  git pull --rebase origin main
  git push -u origin main
fi

echo "[OK] done → https://github.com/zabid-coder/${REPO_NAME}"
