# run/install-windows.ps1 (R61): one-time setup of an always-on BugBrain worker on Windows (Task Scheduler, at logon, hidden).
#   powershell -ExecutionPolicy Bypass -File run\install-windows.ps1 [-Name worker-name]
# Asks once for the GitHub token (Enter = use this PC's git login) if %USERPROFILE%\.bugbrain\token is missing. Safe to re-run. Needs git and node (or bun) on PATH.
param([string]$Name = '')
$ST = Join-Path $env:USERPROFILE '.bugbrain'; New-Item -ItemType Directory -Force -Path $ST | Out-Null
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Write-Host 'Please install Git for Windows first.'; exit 1 }
if (-not ((Get-Command node -ErrorAction SilentlyContinue) -or (Get-Command bun -ErrorAction SilentlyContinue))) { Write-Host 'Please install Node.js (or bun) first.'; exit 1 }
$tf = Join-Path $ST 'token'
if (-not (Test-Path $tf) -or -not (Get-Content $tf -ErrorAction SilentlyContinue)) {
  $t = $env:BB_DQ_TOKEN
  if (-not $t) { $s = Read-Host 'Paste the GitHub token (input hidden)' -AsSecureString; $t = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) }
  if (-not $t) { Write-Host 'No token given: using this PC''s own git login for pushes (fine if git push already works here).' } else {
  Set-Content -Path $tf -Value $t -NoNewline; $t = $null
  icacls $tf /inheritance:r /grant:r "$($env:USERNAME):F" | Out-Null
  Write-Host "token saved in $tf (only you can read it)" }
}
if ($Name) { Set-Content -Path (Join-Path $ST 'worker-name') -Value $Name }
Copy-Item -Force (Join-Path $PSScriptRoot 'worker.ps1') (Join-Path $ST 'worker.ps1')
$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$act = New-ScheduledTaskAction -Execute $ps -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $ST 'worker.ps1') + '"')
$trg = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -StartWhenAvailable
Register-ScheduledTask -TaskName 'BugBrainWorker' -Action $act -Trigger $trg -Settings $set -Description 'BugBrain always-on worker (run/worker.ps1)' -Force | Out-Null
Start-ScheduledTask -TaskName 'BugBrainWorker'
Write-Host "installed: Task Scheduler task BugBrainWorker (at logon, hidden). Log: $ST\worker.log"
