@echo off
rem run_queue.bat (R38): start the autonomous experiment queue (run/queue.js) in the background, below-normal priority.
rem It keeps waiting for new jobs (--wait), waits while CPU use by other programs is above 60 %% (--cpu-max 60), runs one copy only.
rem Pause: pause_queue.bat (creates PAUSE). Resume: resume_queue.bat. Console log: results\queue_console.txt
cd /d "%~dp0"
if not exist results mkdir results
set BBRUN=node
where bun >nul 2>nul && set BBRUN=bun
if exist "%USERPROFILE%\.bun\bin\bun.exe" set BBRUN=%USERPROFILE%\.bun\bin\bun.exe
start "BugBrain queue" /belownormal /min cmd /c ""%BBRUN%" run\queue.js --wait --cpu-max 60 %* >> results\queue_console.txt 2>&1"
