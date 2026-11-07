@echo off
setlocal
cd /d "%~dp0.."
node deploy\server.cjs
pause
