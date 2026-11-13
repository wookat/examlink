@echo off
cd /d %~dp0
where python >nul 2>nul || (echo Python not found & pause & exit /b 1)
python -c "import fastapi" 2>nul || (echo Installing dependencies... & pip install -r requirements.txt)
echo.
echo  examlink - open this on phone (same Wi-Fi):
echo.
python main.py
pause
