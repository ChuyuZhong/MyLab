@echo off
setlocal
chcp 65001 >nul
title MyLab
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [MyLab] Node.js was not found. Please install Node.js 24+ from https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  echo [MyLab] Installing dependencies, first run only...
  call npm ci
  if errorlevel 1 (
    echo [MyLab] npm ci failed.
    pause
    exit /b 1
  )
)

node scripts\start.mjs %*
if errorlevel 1 pause
