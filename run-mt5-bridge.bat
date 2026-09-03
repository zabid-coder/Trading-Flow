@echo off
title SafeScalper - MT5 Monitor / Demo Bridge
cd /d "%~dp0"

echo  ======================================================
echo   Trading Flow — MetaTrader 5 Local Bridge
echo  ======================================================
echo.

python --version >nul 2>&1 || (
    echo  [X] Python not found on this PC.
    echo      Install Python 3.10+ from https://python.org
    echo      and check "Add Python to PATH" during installation.
    pause
    exit /b 1
)

if not defined TF_WEBHOOK_SECRET (
    echo  [X] Set TF_WEBHOOK_SECRET to a long random token before launching.
    echo      The bridge does not print or persist your token.
    pause
    exit /b 1
)
echo  [*] Checking required Python dependencies...
python -c "import fastapi, uvicorn, pydantic, MetaTrader5, numpy, pandas" >nul 2>&1 || (
    echo  [X] Install dependencies first: python -m pip install -r requirements.txt
    pause
    exit /b 1
)

echo.
echo  ======================================================
echo   [!] Ensure MetaTrader 5 is running ^& logged in!
echo   [!] Real-account orders are BLOCKED. Monitoring is the default.
echo   [!] Demo execution requires explicit TF_ENABLE_DEMO_ORDERS=1 opt-in.
echo   [!] Do not run another EA as an execution owner on this account.
echo   [!] Demo advanced exits require this bridge and terminal to stay running.
echo   [!] Browser pause/disconnect does not stop host position management.
echo  ======================================================
echo.
echo  Starting Bridge server on http://localhost:8000 ...
echo.

python -m uvicorn fastapi_mt5_bridge:app --host 127.0.0.1 --port 8000

pause
