@echo off
title Trading Flow — MetaTrader 5 Bridge
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

echo  [*] Checking dependencies (fastapi, uvicorn, MetaTrader5)...
pip install fastapi uvicorn[standard] MetaTrader5 >nul 2>&1

echo.
echo  ======================================================
echo   [!] Ensure MetaTrader 5 is running & logged in!
echo   [!] In MT5: Tools -> Options -> Expert Advisors ->
echo       Tick "Allow Algorithmic Trading"
echo  ======================================================
echo.
echo  Starting Bridge server on http://localhost:8000 ...
echo.

python -m uvicorn fastapi_mt5_bridge:app --host 0.0.0.0 --port 8000 --reload

pause
