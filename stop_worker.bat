@echo off
schtasks /End /TN BugBrainWorker >nul 2>&1
schtasks /Change /TN BugBrainWorker /Disable >nul 2>&1
echo BugBrain stopped.
timeout /t 3 >nul
