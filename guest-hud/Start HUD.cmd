@echo off
cd /d "%~dp0"
"%~dp0runtime\node.exe" "%~dp0guest.cjs" "" --launch
if errorlevel 1 pause
