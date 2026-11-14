@echo off
cd /d %~dp0
where python >nul 2>nul || (echo Python not found & pause & exit /b 1)
python -c "import PyInstaller" 2>nul || (echo Installing PyInstaller... & pip install pyinstaller)
python -m PyInstaller --onefile --name examlink --clean --noconfirm ^
  --add-data "web;web" ^
  --add-data "config.example.json;." ^
  --add-data "knowledge.example.md;." ^
  --hidden-import uvicorn.logging ^
  --hidden-import uvicorn.loops.auto ^
  --hidden-import uvicorn.protocols.http.auto ^
  --hidden-import uvicorn.lifespan.on ^
  --exclude-module torch --exclude-module pandas --exclude-module scipy ^
  --exclude-module sympy --exclude-module matplotlib --exclude-module sqlalchemy ^
  --exclude-module lxml --exclude-module onnxruntime --exclude-module tensorflow ^
  --exclude-module botocore --exclude-module nacl --exclude-module cryptography ^
  --exclude-module pytest --exclude-module IPython --exclude-module statsmodels ^
  --exclude-module numba --exclude-module jinja2 ^
  main.py
echo.
echo  Done: dist\examlink.exe  (~41 MB, no Python needed)
pause
