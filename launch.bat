@echo off
setlocal

:: ── BudgetBrains launcher ────────────────────────────────────────────────────
set "HTML=%~dp0index.html"

:: Find Chrome (checks standard install locations)
set "CHROME="
for %%C in (
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LocalAppData%\Google\Chrome\Application\chrome.exe"
) do (
  if not defined CHROME if exist %%~C set "CHROME=%%~C"
)

if not defined CHROME (
  echo Google Chrome was not found on this machine.
  pause
  exit /b 1
)

start "" "%CHROME%" "--profile-directory=Profile 6" "%HTML%"
