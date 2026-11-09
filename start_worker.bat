@echo off
schtasks /Change /TN BugBrainWorker /Enable >nul 2>&1
schtasks /Run /TN BugBrainWorker
if errorlevel 1 (
  echo Could not start BugBrainWorker. Is it installed?
  pause
  exit /b 1
)
echo BugBrain started.
timeout /t 3 >nul
