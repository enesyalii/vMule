@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules (
  echo Run npm install first.
  exit /b 1
)
set PORT=4243
node server/index.js
