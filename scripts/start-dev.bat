@echo off
setlocal

cd /d "%~dp0.."

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm is not installed or not in PATH.
  pause
  exit /b 1
)

if not exist node_modules (
  echo [INFO] node_modules not found, installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo [INFO] Starting development server...
echo [INFO] Open http://localhost:5173 in your browser after startup.
call npm run dev -- --host 0.0.0.0

if errorlevel 1 (
  echo [ERROR] Development server exited with an error.
  pause
  exit /b 1
)
