@echo off
chcp 65001 >nul
title Instalar Plataforma PIT ITVER
cd /d "%~dp0"
where node >nul 2>nul || (echo No se encontro Node.js. Instalalo desde https://nodejs.org ^(version LTS^) y vuelve a intentar. & pause & exit /b 1)
if not exist node_modules (
  echo Instalando dependencias...
  call npm install --omit=dev || (pause & exit /b 1)
)
node scripts\instalar-local.js %*
pause
