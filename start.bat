@echo off
cd /d "%~dp0"
echo Starting vMule website + client + panel on http://localhost:4242
node server/index.js
