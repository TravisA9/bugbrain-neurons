# run/install-windows.ps1: installs the Compute Lab worker for the CURRENT Windows user, no admin needed.
# Called by the Windows setup file after the preflight checks pass. Running it again is safe.
#  1. Finds an existing Compute Lab task ("ComputeLab Worker", "ComputeLabWorker", or any task that runs
#     computelab-worker.ps1), a Startup-folder entry, and running worker processes, so there is never a second worker.
#     The first existing task is reused; any other copy is disabled (not deleted).
#  2. Registers a per-user logon task (Limited, Interactive). If Windows refuses, tries schtasks for this user, and
#     if that is refused too, adds a hidden starter to this user's Startup folder.
#  3. Starts the worker hidden now. Whether it works is decided by run/verify-start.js, which runs next.
# Exit code 0 when the worker was started, 1 when it could not be started.
param([string]$Branch = 'main', [string]$Url = '')
$ErrorActionPreference = 'Continue'
$st = Join-Path $env:USERPROFILE '.bugbrain'
$ps1 = Join-Path $st 'computelab-worker.ps1'
$user = if ($env:USERDOMAIN) { "$env:USERDOMAIN\$env:USERNAME" } else { $env:USERNAME }
$psArgs = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $ps1 + '"'
# The task runs PowerShell inside a headless console host (Windows 10 1903 and newer). Otherwise Windows 11 may open the
# worker in a Windows Terminal window, and closing that window kills the worker and all its jobs (0xC000013A).
$taskExe = 'powershell.exe'; $taskArgs = $psArgs
if ([Environment]::OSVersion.Version.Build -ge 18362 -and (Test-Path (Join-Path $env:SystemRoot 'System32\conhost.exe'))) { $taskExe = 'conhost.exe'; $taskArgs = '--headless powershell.exe ' + $psArgs }
$startupDir = [Environment]::GetFolderPath('Startup')
$startupFile = Join-Path $startupDir 'ComputeLab Worker.cmd'
function Ok($m) { Write-Host ('  OK    ' + $m) }
function Note($m) { Write-Host ('  NOTE  ' + $m) }
function Bad($m) { Write-Host ('  FAIL  ' + $m) }

# 1. What is already here?
$tasks = @(Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object {
  $_.TaskName -eq 'ComputeLab Worker' -or $_.TaskName -eq 'ComputeLabWorker' -or
  ((@($_.Actions) | ForEach-Object { "$($_.Execute) $($_.Arguments)" }) -join ' ') -match 'computelab-worker\.ps1'
})
$name = 'ComputeLabWorker'
if ($tasks.Count -gt 0) {
  $name = $tasks[0].TaskName
  Note ('found the existing task "' + $name + '"; it will be reused')
}
foreach ($t in $tasks) { Stop-ScheduledTask -TaskName $t.TaskName -TaskPath $t.TaskPath -ErrorAction SilentlyContinue }
$procs = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  "$($_.CommandLine)" -like '*computelab-worker.ps1*' -or
  ($_.Name -eq 'node.exe' -and "$($_.CommandLine)" -match 'run[\\/](supervisor|coord)\.js' -and "$($_.CommandLine)" -match '\.bugbrain|BB_HOME|coordinator-token')
})
if ($procs.Count -gt 0) {
  foreach ($p in $procs) { & taskkill.exe /T /F /PID $p.ProcessId 2>&1 | Out-Null }
  Note ('stopped the Compute Lab worker that was already running (' + $procs.Count + ' process(es)); its jobs go back to the queue')
  Start-Sleep -Seconds 2
}
Remove-Item (Join-Path $st 'coord-alive.json') -ErrorAction SilentlyContinue

# 2. Background start at logon, for this user only.
$method = ''
try {
  $action = New-ScheduledTaskAction -Execute $taskExe -Argument $taskArgs
  # At logon, and every 3 minutes as a watchdog: with IgnoreNew the repeat does nothing while the worker runs and starts
  # it again within 3 minutes when it is gone (crash, closed window, killed by hand).
  $trigger = @((New-ScheduledTaskTrigger -AtLogOn -User $user), (New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(2)) -RepetitionInterval (New-TimeSpan -Minutes 3)))
  $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force -ErrorAction Stop | Out-Null
  $method = 'task'
  Ok ('scheduled task "' + $name + '" starts the worker when ' + $env:USERNAME + ' logs on, and again within 3 minutes if it stops')
} catch {
  Note ('Windows did not allow a scheduled task (' + ($_.Exception.Message -split "`n")[0].Trim() + '); trying schtasks')
}
if (-not $method) {
  $out = & schtasks.exe /Create /F /SC ONLOGON /RL LIMITED /IT /RU $user /TN $name /TR ($taskExe + ' ' + $taskArgs) 2>&1
  if ($LASTEXITCODE -eq 0) { $method = 'task'; Ok ('scheduled task "' + $name + '" (schtasks) starts the worker at logon') }
  else { Note ('schtasks was refused too (' + ("$out" -split "`n")[0].Trim() + '); using the Startup folder instead') }
}
if (-not $method) {
  try {
    if (-not (Test-Path $startupDir)) { New-Item -ItemType Directory -Path $startupDir -Force | Out-Null }
    Set-Content -Path $startupFile -Encoding ASCII -Value ('@start "" /min powershell.exe ' + $psArgs) -ErrorAction Stop
    $method = 'startup'
    Ok ('Startup folder entry starts the worker when ' + $env:USERNAME + ' logs on')
    foreach ($t in $tasks) { Disable-ScheduledTask -TaskName $t.TaskName -TaskPath $t.TaskPath -ErrorAction SilentlyContinue | Out-Null }
  } catch {
    Bad ('could not add a Startup folder entry either: ' + $_.Exception.Message)
  }
}
if ($method -eq 'task' -and (Test-Path $startupFile)) { Remove-Item $startupFile -ErrorAction SilentlyContinue }
# Never two starters: disable every other Compute Lab task (kept, not deleted).
foreach ($t in $tasks) {
  if ($t.TaskName -ne $name -or $method -ne 'task') {
    if ($t.TaskName -ne $name) {
      Disable-ScheduledTask -TaskName $t.TaskName -TaskPath $t.TaskPath -ErrorAction SilentlyContinue | Out-Null
      Note ('disabled the extra task "' + $t.TaskName + '" so only one worker runs')
    }
  }
}

# 3. Start it now, hidden.
$started = $false
if ($method -eq 'task') {
  try { Start-ScheduledTask -TaskName $name -ErrorAction Stop; $started = $true; Ok 'worker started from the scheduled task' }
  catch { Note ('could not start the task now (' + ($_.Exception.Message -split "`n")[0].Trim() + '); starting it directly') }
}
if (-not $started) {
  try {
    Start-Process -FilePath 'powershell.exe' -ArgumentList $psArgs -WindowStyle Hidden -ErrorAction Stop | Out-Null
    $started = $true; Ok 'worker started in the background'
  } catch { Bad ('could not start the worker: ' + $_.Exception.Message) }
}

# Stop and remove scripts that match how it was installed.
$stop = @(
  '@echo off',
  ('schtasks /End /TN "' + $name + '" >nul 2>&1'),
  ('schtasks /Change /TN "' + $name + '" /DISABLE >nul 2>&1'),
  'powershell -NoProfile -Command "$p = Join-Path $env:USERPROFILE ''.bugbrain\computelab.pid''; if (Test-Path $p) { taskkill /T /F /PID (Get-Content $p) 2>&1 | Out-Null; Remove-Item $p }"',
  ('del /q "' + $startupFile + '" >nul 2>&1'),
  'echo Compute Lab is stopped and will not start at logon. Run the setup file again to turn it back on.'
)
Set-Content -Path (Join-Path $st 'stop-computelab.cmd') -Encoding ASCII -Value $stop
$remove = @(
  '@echo off',
  'call "%USERPROFILE%\.bugbrain\stop-computelab.cmd"',
  ('schtasks /Delete /TN "' + $name + '" /F >nul 2>&1'),
  'if /I "%~1"=="--keep" goto done',
  'del /q "%USERPROFILE%\.bugbrain\coordinator-token" 2>nul',
  'rmdir /s /q "%USERPROFILE%\.bugbrain\worker" 2>nul',
  ':done',
  'echo Compute Lab was removed from this Windows account.'
)
Set-Content -Path (Join-Path $st 'uninstall-computelab.cmd') -Encoding ASCII -Value $remove
Set-Content -Path (Join-Path $st 'install-method.txt') -Encoding ASCII -Value ($method + ' ' + $name)
if ($started) { exit 0 } else { exit 1 }
