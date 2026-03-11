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
echo [INFO] Browser will open automatically after the Vite server starts.
call npm run dev -- --host 0.0.0.0 --open

if errorlevel 1 (
  echo [ERROR] Development server exited with an error.
  pause
  exit /b 1
)
