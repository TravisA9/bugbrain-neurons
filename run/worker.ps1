# run/worker.ps1 (R61): stable launcher for an always-on BugBrain worker on Windows. Never needs editing:
# install-windows.ps1 copies it to %USERPROFILE%\.bugbrain\worker.ps1; all logic lives in run/supervisor.js (updated from git).
# Loop: fetch + reset the checkout to origin/neuro/distributed-queue (local edits stashed), run the supervisor,
# restart at once on exit 10 (update), wait for a new token on exit 3, back off on crashes.
$ErrorActionPreference = 'Continue'
$ST = if ($env:BB_STATE_DIR) { $env:BB_STATE_DIR } else { Join-Path $env:USERPROFILE '.bugbrain' }
$DIR = if ($env:BB_HOME) { $env:BB_HOME } else { Join-Path $env:USERPROFILE 'bugbrain-neurons' }
$BR = if ($env:BB_CODE_BRANCH) { $env:BB_CODE_BRANCH } else { 'neuro/distributed-queue' }
$REPO = if ($env:BB_REPO) { $env:BB_REPO } else { 'https://github.com/TravisA9/bugbrain-neurons.git' }
$LOG = Join-Path $ST 'worker.log'
New-Item -ItemType Directory -Force -Path $ST | Out-Null
$mutex = New-Object System.Threading.Mutex($false, 'Global\BugBrainWorker')
if (-not $mutex.WaitOne(0)) { exit 0 }   # already running
$env:GIT_TERMINAL_PROMPT = '0'
function Log($m) { Add-Content -Path $LOG -Value ("[{0}] [launcher] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) }
function Git { & git @args 2>&1 | ForEach-Object { "$_" } | Add-Content -Path $LOG; return $LASTEXITCODE }
$fails = 0
while ($true) {
  if ((Test-Path $LOG) -and (Get-Item $LOG).Length -gt 5MB) { Move-Item -Force $LOG "$LOG.1" }
  if (-not (Test-Path (Join-Path $DIR '.git'))) { Log "cloning $BR into $DIR"; if ((Git clone -q -b $BR $REPO $DIR) -ne 0) { Log 'clone failed; retry in 60 s'; Start-Sleep 60; continue } }
  Set-Location $DIR
  if ((Git fetch -q origin "+refs/heads/${BR}:refs/bb/code") -eq 0) {
    $dirty = & git status --porcelain --untracked-files=no
    if ($dirty) { Git stash push -q -m ("bb-worker autostash " + (Get-Date -Format s)) | Out-Null; Log 'local edits stashed (git stash list)' }
    $old = & git rev-parse --short HEAD
    Git checkout -q -B $BR refs/bb/code | Out-Null; Git reset -q --hard refs/bb/code | Out-Null
    $new = & git rev-parse --short HEAD; if ($old -ne $new) { Log "code $old -> $new" }
  } else { Log 'fetch failed; running the code that is here' }
  $rt = (Get-Command node -ErrorAction SilentlyContinue); if (-not $rt) { $rt = (Get-Command bun -ErrorAction SilentlyContinue) }
  if (-not $rt) { Log 'node (or bun) not found; retry in 5 min'; Start-Sleep 300; continue }
  $t0 = Get-Date
  & $rt.Source run/supervisor.js *>> $LOG
  $code = $LASTEXITCODE; $ran = ((Get-Date) - $t0).TotalSeconds
  if ($code -eq 10) { $fails = 0; continue }
  if ($code -eq 3) {
    Log "token refused: put a valid token in $ST\token; checking again every minute"
    $tf = Join-Path $ST 'token'; $m0 = if (Test-Path $tf) { (Get-Item $tf).LastWriteTime } else { $null }
    for ($i = 0; $i -lt 30; $i++) { Start-Sleep 60; $m1 = if (Test-Path $tf) { (Get-Item $tf).LastWriteTime } else { $null }; if ($m1 -ne $m0) { break } }
    continue }
  if ($ran -gt 600) { $fails = 0 }; $fails++
  $w = [Math]::Min(600, 15 * [Math]::Pow(2, [Math]::Min($fails - 1, 6)))
  Log "supervisor exited ($code) after $([int]$ran)s; restart in $([int]$w)s"; Start-Sleep -Seconds $w
}
