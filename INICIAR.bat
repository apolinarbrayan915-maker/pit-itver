@echo off
chcp 65001 >nul
title Plataforma PIT ITVER
cd /d "%~dp0"
if not exist .env (echo Primero ejecuta INSTALAR.bat & pause & exit /b 1)
start "" http://localhost:3000
node server\src\server.js
pause
