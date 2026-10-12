# Spiking Arena: long local experiments on Windows PowerShell (v25). Uses Bun if installed, otherwise Node.
#   .\run.ps1 experiments\multitask.json                     start a run (results\<date>_<name>\)
#   .\run.ps1 experiments\text_baseline.json --hours 8       stop after 8 hours
#   .\run.ps1 experiments\novelty_free.json --smoke          tiny 2-generation test
#   .\run.ps1 --resume results\2026-10-12_220500_multitask   continue from the checkpoint
#   .\run.ps1 report | bench | selftest
# Stop: Ctrl+C once (finishes the generation, saves, stops) or create a file named STOP in the run folder.
# If scripts are blocked: powershell -ExecutionPolicy Bypass -File .\run.ps1 experiments\multitask.json
# $env:RUNTIME = 'node' or 'bun' forces one.
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot
$rt = $env:RUNTIME
if (-not $rt) { if (Get-Command bun -ErrorAction SilentlyContinue) { $rt = 'bun' } else { $rt = 'node' } }
if ($args.Count -eq 0) {
  Write-Host 'Usage: .\run.ps1 experiments\multitask.json [--hours H] [--gens N] [--workers N] [--pop N] [--smoke]'
  Write-Host '       .\run.ps1 --resume results\<run folder>  |  .\run.ps1 report  |  .\run.ps1 bench  |  .\run.ps1 selftest'
  Get-ChildItem experiments\*.json | ForEach-Object { Write-Host ('  ' + $_.Name) }
  exit 1
}
$rest = @(); if ($args.Count -gt 1) { $rest = $args[1..($args.Count - 1)] }
switch ($args[0]) {
  'report'   { & $rt run\report.js @rest }
  'bench'    { & node run\bench.js @rest }
  'selftest' { & $rt run\selftest.js }
  default    { & $rt run\runner.js @args }
}
