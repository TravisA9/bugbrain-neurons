@echo off
rem run_queue.bat (R38): start the autonomous experiment queue (run/queue.js) with bun, below-normal priority, waits for new jobs.
rem Pause: create a file named PAUSE in this folder (pause_queue.bat). Resume: delete it (resume_queue.bat). Log: results\queue_console.txt
cd /d "%~dp0"
if not exist results mkdir results
where bun >nul 2>nul && (set BBRUN=bun) || (set BBRUN=node)
if exist "%USERPROFILE%\.bun\bin\bun.exe" set BBRUN="%USERPROFILE%\.bun\bin\bun.exe"
start "BugBrain queue" /belownormal /min cmd /c "%BBRUN% run\queue.js --wait --cpu-max 60 %* >> results\queue_console.txt 2>&1"
