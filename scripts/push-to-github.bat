@echo off
REM ============================================================
REM Trading Flow — one-shot GitHub push (Windows)
REM Double-click this file, or run:  scripts\push-to-github.bat
REM Target repo: git@github.com:zabid-coder/Trading-Flow.git
REM Does: git init -> add -> commit -> attach remote -> push
REM Requires: an SSH key registered on your GitHub account.
REM ============================================================
set REPO=Trading-Flow
set SSH_URL=git@github.com:zabid-coder/%REPO%.git
set HTTPS_URL=https://github.com/zabid-coder/%REPO%.git
cd /d "%~dp0.."

git --version >nul 2>&1 || ( echo [X] git not found - install it first. & pause & exit /b 1 )

if not exist .git git init -b main
git add .
git commit -m "Trading Flow — Algorithmic Trading Suite" --allow-empty

REM pick remote: SSH if reachable, HTTPS otherwise
git ls-remote "%SSH_URL%" >nul 2>&1 && (
    set REMOTE_URL=%SSH_URL%
    echo =^> using SSH remote: %SSH_URL%
) || (
    set REMOTE_URL=%HTTPS_URL%
    echo =^> SSH key not accepted - falling back to HTTPS: %HTTPS_URL%
    echo    ^(to use SSH: github.com/settings/keys -^> add your public key^)
)

git remote remove origin >nul 2>&1
git remote add origin %REMOTE_URL%

git push -u origin main || (
    echo =^> push rejected ^(remote has history^) - rebasing then pushing...
    git pull --rebase origin main
    git push -u origin main
)

echo [OK] done - https://github.com/zabid-coder/%REPO%
pause
