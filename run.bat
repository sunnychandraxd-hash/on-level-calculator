@echo off
echo ═══════════════════════════════════════════════════
echo   On-Level Calculator — Starting Server
echo ═══════════════════════════════════════════════════
echo.

cd /d "%~dp0backend"

echo [1/2] Installing dependencies...
pip install -r requirements.txt --quiet

echo.
echo [2/2] Starting FastAPI server...
echo Open http://localhost:8000 in your browser
echo Press Ctrl+C to stop
echo.

python main.py
pause
