@echo off
rem Spiking Arena: long local experiments on Windows (v25). Uses Bun if installed, otherwise Node.
rem   run.bat experiments\multitask.json                    start a run (results\<date>_<name>\)
rem   run.bat experiments\text_baseline.json --hours 8      stop after 8 hours
rem   run.bat experiments\multitask.json --workers 6 --pop 48
rem   run.bat experiments\novelty_free.json --smoke         tiny 2-generation test of a config
rem   run.bat --resume results\2026-10-12_220500_multitask  continue a stopped run from its checkpoint
rem   run.bat report                                        table of all runs
rem   run.bat bench                                         Node vs Bun speed on this PC + recommendation
rem   run.bat selftest                                      quick check of the runner
rem Stop a run: Ctrl+C once (finishes the generation, saves, stops); or create a file named STOP in the run folder.
rem Set RUNTIME=node or RUNTIME=bun to force one.
setlocal
cd /d "%~dp0"
if "%RUNTIME%"=="" (
  where bun >nul 2>nul && (set RUNTIME=bun) || (set RUNTIME=node)
)
if "%~1"=="" goto usage
if /i "%~1"=="report" ( %RUNTIME% run\report.js %2 %3 & goto :eof )
if /i "%~1"=="bench" ( node run\bench.js %2 %3 %4 & goto :eof )
if /i "%~1"=="selftest" ( %RUNTIME% run\selftest.js & goto :eof )
%RUNTIME% run\runner.js %*
goto :eof
:usage
echo Usage: run.bat experiments\multitask.json [--hours H] [--gens N] [--workers N] [--pop N] [--smoke]
echo        run.bat --resume results\^<run folder^>   ^|   run.bat report   ^|   run.bat bench   ^|   run.bat selftest
echo Configs:
dir /b experiments\*.json
