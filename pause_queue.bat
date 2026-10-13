@echo off
rem Pause the BugBrain queue: it stops after the current generation (checkpoint) and waits.
cd /d "%~dp0"
echo paused %date% %time% > PAUSE
echo Queue paused. Run resume_queue.bat to continue.
