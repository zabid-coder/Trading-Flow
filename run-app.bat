@echo off
title Trading Flow — Algorithmic Trading Suite
cd /d "%~dp0"

echo  Trading Flow — Algorithmic Trading Suite
echo  ========================================

node --version >nul 2>&1 || (
    echo  [X] Node.js not found on this PC.
    echo      Install it from https://nodejs.org ^(LTS version^)
    echo      then double-click this file again.
    pause
    exit /b 1
)

if not exist node_modules (
    echo  =^> First run: installing dependencies (one time only)...
    call npm install
)

echo  =^> Starting Trading Flow...
echo      Browser will open automatically.
echo      Press Ctrl+C in this window to stop.
echo.
call npm run dev -- --open
pause
