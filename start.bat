@echo off
cd /d "%~dp0"
echo Starting vMule website + client on http://localhost:4242
node server/index.js
