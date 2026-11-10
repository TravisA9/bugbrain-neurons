<?php
declare(strict_types=1);

/** One-time setup scripts. The token is embedded in the download and is not printed when the script runs. */
function setup_script(string $os, string $token, string $publicUrl, string $repo, string $ref): string
{
    if ($os !== 'windows' && $os !== 'unix') {
        throw new InvalidArgumentException('Choose Windows or Mac/Linux.');
    }
    if (!preg_match('/^[a-f0-9]{32,128}$/', $token)) {
        throw new InvalidArgumentException('That token is not valid.');
    }
    if ((strpos($publicUrl, 'https://') !== 0 && strpos($publicUrl, 'http://') !== 0) || preg_match('/[\s\'"`]/', $publicUrl) || strlen($publicUrl) > 300) {
        throw new InvalidArgumentException('The coordinator address is not a usable URL.');
    }
    if (strpos($repo, 'https://') !== 0 || preg_match('/[\s\'"`]/', $repo) || strlen($repo) > 300) {
        throw new InvalidArgumentException('The worker download address is not a usable URL.');
    }
    if (!preg_match('/^[A-Za-z0-9._\/-]{1,80}$/', $ref)) {
        throw new InvalidArgumentException('The worker version name is not usable.');
    }
    if ($os === 'windows') {
        return setup_windows($token, $publicUrl, $repo, $ref);
    }
    return setup_unix($token, $publicUrl, $repo, $ref);
}

function setup_windows(string $token, string $publicUrl, string $repo, string $ref): string
{
    return "@echo off\r\n"
        . "setlocal\r\n"
        . "where node >nul 2>&1\r\n"
        . "if errorlevel 1 (\r\n"
        . "  echo Node.js is not installed.\r\n"
        . "  echo Install it from https://nodejs.org/ and run this file again.\r\n"
        . "  pause\r\n"
        . "  exit /b 1\r\n"
        . ")\r\n"
        . "where git >nul 2>&1\r\n"
        . "if errorlevel 1 (\r\n"
        . "  echo Git is not installed.\r\n"
        . "  echo Install it from https://git-scm.com/ and run this file again.\r\n"
        . "  pause\r\n"
        . "  exit /b 1\r\n"
        . ")\r\n"
        . "set \"DEST=%USERPROFILE%\\.bugbrain\"\r\n"
        . "set \"REPO=%USERPROFILE%\\.bugbrain\\worker\"\r\n"
        . "set \"LOGS=%USERPROFILE%\\.bugbrain\\logs\"\r\n"
        . "if not exist \"%DEST%\" mkdir \"%DEST%\"\r\n"
        . "if not exist \"%LOGS%\" mkdir \"%LOGS%\"\r\n"
        // Already added? Check the token on this computer first: keep a valid entry (no duplicate), back up a revoked one.
        . "powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand " . setup_windows_token_ps1_encoded($token, $publicUrl) . "\r\n"
        . "if errorlevel 1 (\r\n"
        . "  pause\r\n"
        . "  exit /b 1\r\n"
        . ")\r\n"
        . "set \"KEPT=\"\r\n"
        . "if exist \"%DEST%\\setup-kept-entry\" set /p KEPT=<\"%DEST%\\setup-kept-entry\"\r\n"
        . "setx BB_COORDINATOR_URL \"" . $publicUrl . "\" >nul\r\n"
        . "setx BB_COORDINATOR_TOKEN_FILE \"%USERPROFILE%\\.bugbrain\\coordinator-token\" >nul\r\n"
        . "setx BB_CODE_BRANCH \"" . $ref . "\" >nul\r\n"
        . "set \"BB_COORDINATOR_URL=" . $publicUrl . "\"\r\n"
        . "set \"BB_COORDINATOR_TOKEN_FILE=%USERPROFILE%\\.bugbrain\\coordinator-token\"\r\n"
        . "set \"BB_CODE_BRANCH=" . $ref . "\"\r\n"
        . "set \"BB_HOME=%REPO%\"\r\n"
        . "if exist \"%REPO%\\.git\" (\r\n"
        . "  git -C \"%REPO%\" -c core.autocrlf=false fetch --depth 1 origin " . $ref . "\r\n"
        . "  git -C \"%REPO%\" checkout --force FETCH_HEAD\r\n"
        . ") else (\r\n"
        . "  git -c core.autocrlf=false clone --depth 1 --branch " . $ref . " " . $repo . " \"%REPO%\"\r\n"
        . ")\r\n"
        . "if errorlevel 1 (\r\n"
        . "  echo Could not download the worker files.\r\n"
        . "  pause\r\n"
        . "  exit /b 1\r\n"
        . ")\r\n"
        . "echo.\r\n"
        . "node \"%REPO%\\run\\preflight.js\" --url \"" . $publicUrl . "\" --token-file \"%USERPROFILE%\\.bugbrain\\coordinator-token\" --install task-scheduler\r\n"
        . "if errorlevel 1 (\r\n"
        . "  echo Setup stopped. Read the lines above, fix the problem, and run this file again.\r\n"
        . "  pause\r\n"
        . "  exit /b 1\r\n"
        . ")\r\n"
        . "powershell -NoProfile -Command \"[IO.File]::WriteAllText((Join-Path \$env:USERPROFILE '.bugbrain\\computelab-worker.ps1'), [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" . base64_encode(setup_windows_worker_ps1($publicUrl, $ref)) . "')))\"\r\n"
        . "for /f %%t in ('powershell -NoProfile -Command \"[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()\"') do set \"SINCE=%%t\"\r\n"
        // Per-user task, then schtasks, then the Startup folder; reuses an existing Compute Lab task and never starts a second worker.
        . "powershell -NoProfile -ExecutionPolicy Bypass -File \"%REPO%\\run\\install-windows.ps1\" -Branch \"" . $ref . "\" -Url \"" . $publicUrl . "\"\r\n"
        . "set \"INSTALLED=%ERRORLEVEL%\"\r\n"
        // Success is printed only after the worker process is alive and has checked in with the coordinator.
        . "node \"%REPO%\\run\\verify-start.js\" --url \"" . $publicUrl . "\" --token-file \"%USERPROFILE%\\.bugbrain\\coordinator-token\" --since %SINCE% --wait 150\r\n"
        . "if errorlevel 1 goto notrunning\r\n"
        . "if not \"%INSTALLED%\"==\"0\" goto notrunning\r\n"
        . "echo.\r\n"
        . "if defined KEPT echo This computer is already added as %KEPT%. Setup kept that entry and restarted its worker; no new entry was added.\r\n"
        . "echo Compute Lab is running in the background and will start again when you log on.\r\n"
        . "echo Logs are in %USERPROFILE%\\.bugbrain\\logs\r\n"
        . "echo To stop it, run %USERPROFILE%\\.bugbrain\\stop-computelab.cmd\r\n"
        . "echo To remove the task, the token, and the checkout, run %USERPROFILE%\\.bugbrain\\uninstall-computelab.cmd\r\n"
        . "echo Your token was saved and was not printed here.\r\n"
        . "pause\r\n"
        . "exit /b 0\r\n"
        . ":notrunning\r\n"
        . "echo.\r\n"
        . "echo FAIL: Compute Lab is NOT running yet. Read the FAIL line and Fix above, fix it, and run this file again.\r\n"
        . "echo The problem was also sent to the Compute Lab owner when the coordinator could be reached.\r\n"
        . "pause\r\n"
        . "exit /b 1\r\n";
}

/* Runs before anything else in the Windows setup. Exit 1 only when the existing entry could not be checked. */
function setup_windows_token_ps1(string $token, string $publicUrl): string
{
    $ps = <<<'PS'
$ErrorActionPreference = 'Stop'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}
$p = Join-Path $env:USERPROFILE '.bugbrain\coordinator-token'
$m = Join-Path $env:USERPROFILE '.bugbrain\setup-kept-entry'
$n = '@@TOKEN@@'
$u = '@@URL@@'
Remove-Item $m -ErrorAction SilentlyContinue
if (Test-Path $p) {
  $o = ([IO.File]::ReadAllText($p)).Trim()
  if ($o -eq $n) { exit 0 }
  $gone = $true
  if ($o -match '^[a-f0-9]{32,128}$') {
    try {
      $r = Invoke-RestMethod -Method Post -Uri ($u + '/api/v1/setup/existing') -Headers @{ Authorization = 'Bearer ' + $o } -ContentType 'application/json' -Body (@{ newToken = $n } | ConvertTo-Json) -TimeoutSec 30 -UseBasicParsing
      $gone = $false
    } catch {
      $code = 0
      if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
      if ($code -ne 401 -and $code -ne 403) {
        Write-Host 'FAIL: could not check the Compute Lab entry this computer already has (no answer from Compute Lab).'
        Write-Host 'Fix: check the internet connection and run this file again. Nothing was changed.'
        exit 1
      }
    }
  }
  if (-not $gone) {
    Write-Host ('This computer is already added as ' + $r.name + '. Setup keeps that entry and updates its worker.')
    if ($r.retired) { Write-Host ('The new entry ' + $r.retired + ' was not needed, so it was removed automatically.') }
    [IO.File]::WriteAllText($m, [string]$r.name)
    exit 0
  }
  $b = $p + '.previous-' + (Get-Date -Format yyyyMMdd-HHmmss)
  Copy-Item $p $b
  Write-Host ('The Compute Lab token already on this computer no longer works (revoked or unknown), so setup adds this computer as a new entry. The old token was kept in ' + $b + '.')
}
[IO.File]::WriteAllText($p, $n + [Environment]::NewLine)
exit 0
PS;
    return strtr($ps, ['@@TOKEN@@' => $token, '@@URL@@' => rtrim($publicUrl, '/')]);
}

function setup_windows_token_ps1_encoded(string $token, string $publicUrl): string
{
    $script = str_replace("\n", "\r\n", setup_windows_token_ps1($token, $publicUrl));
    $wide = '';
    for ($i = 0, $n = strlen($script); $i < $n; $i++) {
        $wide .= $script[$i] . "\0"; // the script is ASCII, so UTF-16LE is each byte plus a zero
    }
    return base64_encode($wide);
}

/* The scheduled task runs this. It sets the Compute Lab settings and starts the launcher loop (run/worker.ps1), which
 * keeps the checkout on the branch, restarts the supervisor after updates (exit 10), and backs off on crashes. */
function setup_windows_worker_ps1(string $publicUrl, string $ref): string
{
    return "\$ErrorActionPreference = 'Continue'\r\n"
        . "\$env:BB_CODE_BRANCH = '" . $ref . "'\r\n"
        . "\$env:BB_COORDINATOR_URL = '" . $publicUrl . "'\r\n"
        . "\$env:BB_COORDINATOR_TOKEN_FILE = Join-Path \$env:USERPROFILE '.bugbrain\\coordinator-token'\r\n"
        . "\$env:BB_HOME = Join-Path \$env:USERPROFILE '.bugbrain\\worker'\r\n"
        . "\$env:BB_INSTALL = 'task-scheduler'\r\n"
        . "\$PID | Set-Content -Path (Join-Path \$env:USERPROFILE '.bugbrain\\computelab.pid')\r\n"
        . "Set-Location \$env:BB_HOME\r\n"
        . "& (Join-Path \$env:BB_HOME 'run\\worker.ps1')\r\n";
}

function setup_unix(string $token, string $publicUrl, string $repo, string $ref): string
{
    return strtr(setup_unix_template(), [
        '@@TOKEN@@' => $token,
        '@@URL@@' => rtrim($publicUrl, '/'),
        '@@REPO@@' => $repo,
        '@@REF@@' => $ref,
    ]);
}

/* POSIX sh, so it works as "sh file", "bash file", or "curl ... | sh" with no chmod. Commands that could read standard
 * input get </dev/null, because with "curl | sh" standard input is the script itself. */
function setup_unix_template(): string
{
    return <<<'SH'
#!/bin/sh
# Compute Lab setup for Linux and macOS.
# Run it with:  sh computelab-setup.sh   (bash works too; no chmod needed). Running it again is safe.
# It saves this computer's worker token (never printed), downloads the worker with git, installs a background
# service (systemd user service, launchd, or a login cron job), and checks the result.
set -u
URL='@@URL@@'
REPO='@@REPO@@'
REF='@@REF@@'
ST="$HOME/.bugbrain"
TOKEN_FILE="$ST/coordinator-token"
NODE_VERSION=none
METHOD=none
export GIT_TERMINAL_PROMPT=0
umask 077
mkdir -p "$ST/logs" || { echo "Could not create $ST"; exit 1; }
NEW_TOKEN='@@TOKEN@@'
KEPT=
# Already added? If this computer has a token that still works, keep that entry (the server retires the unused new
# one). If the old token was revoked or is unknown, keep a copy of it and add this computer as a new entry.
existing_check() {
  hdr="$ST/.chk-auth"; req="$ST/.chk-req"; out="$ST/.chk-out"
  printf 'Authorization: Bearer %s\n' "$1" > "$hdr"
  printf '{"newToken":"%s"}' "$NEW_TOKEN" > "$req"
  CODE=000
  if command -v curl >/dev/null 2>&1; then
    CODE=$(curl -sS -m 30 -A computelab-setup -H "@$hdr" -H 'Content-Type: application/json' --data-binary "@$req" -o "$out" -w '%{http_code}' "$URL/api/v1/setup/existing" 2>/dev/null </dev/null) || true
  elif command -v wget >/dev/null 2>&1; then
    wget -q -S -T 30 -U computelab-setup --header="$(cat "$hdr")" --header='Content-Type: application/json' --post-file="$req" -O "$out" "$URL/api/v1/setup/existing" 2>"$ST/.chk-head" </dev/null || true
    CODE=$(grep -o 'HTTP/[0-9.]* [0-9][0-9][0-9]' "$ST/.chk-head" 2>/dev/null | tail -n 1 | sed 's/.* //')
    rm -f "$ST/.chk-head"
  fi
  BODY=$(cat "$out" 2>/dev/null)
  rm -f "$hdr" "$req" "$out"
}
if [ -s "$TOKEN_FILE" ]; then
  OLD=$(tr -d ' \r\n' < "$TOKEN_FILE")
  if [ "$OLD" != "$NEW_TOKEN" ]; then
    case "$OLD" in ''|*[!a-f0-9]*) CODE=401 ;; *) existing_check "$OLD" ;; esac
    if [ "$CODE" = 200 ]; then
      KEPT=$(printf '%s' "$BODY" | sed -n 's/.*"name":"\([a-z0-9._-]*\)".*/\1/p')
      RETIRED=$(printf '%s' "$BODY" | sed -n 's/.*"retired":"\([a-z0-9._-]*\)".*/\1/p')
      [ -n "$KEPT" ] || KEPT='its existing entry'
      printf '%s\n' "This computer is already added as $KEPT. Setup keeps that entry and updates its worker."
      [ -n "$RETIRED" ] && printf '%s\n' "The new entry $RETIRED was not needed, so it was removed automatically."
    elif [ "$CODE" = 401 ] || [ "$CODE" = 403 ]; then
      KEEP="$TOKEN_FILE.previous-$(date +%Y%m%d-%H%M%S)"
      cp -p "$TOKEN_FILE" "$KEEP"
      printf '%s\n' "The Compute Lab token already on this computer no longer works (revoked or unknown), so setup adds this computer as a new entry. The old token was kept in $KEEP."
    else
      printf '%s\n' "Setup stopped: could not check the Compute Lab entry this computer already has (no answer from Compute Lab)."
      printf '%s\n' "Fix: check the internet connection and run the setup command again. Nothing was changed."
      exit 1
    fi
  fi
fi
if [ -z "$KEPT" ]; then
  printf '%s\n' "$NEW_TOKEN" > "$TOKEN_FILE" && chmod 600 "$TOKEN_FILE"
fi

say() { printf '%s\n' "$*"; }
# Tell the coordinator why setup stopped, so the owner can see it. The token goes in a header read from a private file.
report() {
  os=$(uname -sr 2>/dev/null | tr -d '"\\')
  distro=$( (. /etc/os-release 2>/dev/null; printf '%s' "${PRETTY_NAME:-}") | tr -d '"\\')
  [ -z "$distro" ] && [ "$(uname -s)" = Darwin ] && distro="macOS $(sw_vers -productVersion 2>/dev/null </dev/null)"
  body=$(printf '{"kind":"setup","ok":false,"summary":"%s","hint":"%s","os":"%s","distro":"%s","arch":"%s","node":"%s","install":"%s"}' \
    "$1" "$2" "$os" "$distro" "$(uname -m 2>/dev/null)" "$NODE_VERSION" "$METHOD")
  hdr="$ST/.diag-auth"
  printf 'Authorization: Bearer %s\n' "$(cat "$TOKEN_FILE")" > "$hdr"
  sent=0
  if command -v curl >/dev/null 2>&1; then
    curl -fsS -m 20 -A computelab-setup -H "@$hdr" -H 'Content-Type: application/json' -d "$body" "$URL/api/v1/diagnostics" >/dev/null 2>&1 </dev/null && sent=1
  elif command -v wget >/dev/null 2>&1; then
    wget -q -T 20 -U computelab-setup --header="$(cat "$hdr")" --header='Content-Type: application/json' --post-data="$body" -O /dev/null "$URL/api/v1/diagnostics" >/dev/null 2>&1 </dev/null && sent=1
  fi
  rm -f "$hdr"
  [ "$sent" = 1 ] && say "(This problem was also sent to the Compute Lab owner.)"
  return 0
}
fail() { say ""; say "Setup stopped: $1"; [ -n "$2" ] && say "Fix: $2"; report "Setup failed: $1" "$2"; exit 1; }

say "Compute Lab setup"
# 1. Node.js 18 or newer. Look past PATH too (nvm, fnm, volta, Homebrew, snap): services do not read ~/.bashrc,
#    so the path found here is written into the service.
best=; best_major=0; any=
for c in "$(command -v node 2>/dev/null)" "$HOME"/.nvm/versions/node/*/bin/node "$HOME"/.local/share/fnm/node-versions/*/installation/bin/node \
         "$HOME/.volta/bin/node" "$HOME/.local/bin/node" /usr/local/bin/node /opt/homebrew/bin/node /usr/bin/node /snap/bin/node; do
  [ -n "$c" ] && [ -x "$c" ] || continue
  m=$("$c" -p "process.versions.node.split('.')[0]" 2>/dev/null </dev/null) || continue
  case "$m" in ''|*[!0-9]*) continue ;; esac
  [ -z "$any" ] && { any=$c; NODE_VERSION=$("$c" -v 2>/dev/null </dev/null); }
  if [ "$m" -ge 18 ] && [ "$m" -gt "$best_major" ]; then best=$c; best_major=$m; fi
done
if [ -z "$best" ]; then
  if [ -n "$any" ]; then
    fail "Node.js $NODE_VERSION is too old (18 or newer is needed)" "Install Node.js 20 LTS from https://nodejs.org/en/download (the apt package on older Ubuntu and Debian is too old), then run the setup command again."
  fi
  fail "Node.js is not installed" "Install Node.js 20 LTS from https://nodejs.org/en/download, then run the setup command again."
fi
NODE_VERSION=$("$best" -v </dev/null)
NODE_DIR=$(dirname "$best")
say "  OK    Node.js $NODE_VERSION ($best)"
# 2. git
command -v git >/dev/null 2>&1 || fail "git is not installed" "Debian/Ubuntu: sudo apt install git. Fedora: sudo dnf install git. Mac: xcode-select --install. Then run the setup command again."
say "  OK    $(git --version </dev/null)"
# 3. Worker files
repo="$ST/worker"
if [ -d "$repo/.git" ]; then
  git -C "$repo" config core.autocrlf false </dev/null
  { git -C "$repo" fetch -q --depth 1 origin "+refs/heads/$REF:refs/bb/code" </dev/null \
    && git -C "$repo" checkout -q -f -B "$REF" refs/bb/code </dev/null && git -C "$repo" reset -q --hard refs/bb/code </dev/null; } \
    || fail "Could not update the worker files in $repo" "Check the internet connection. If it keeps failing, delete $repo and run the setup command again."
else
  rm -rf "$repo"
  git -c core.autocrlf=false clone -q --depth 1 --branch "$REF" "$REPO" "$repo" </dev/null \
    || fail "Could not download the worker files from GitHub" "Check the internet connection and run the setup command again."
  git -C "$repo" config core.autocrlf false </dev/null
fi
say "  OK    worker files ($(git -C "$repo" rev-parse --short HEAD </dev/null))"
# 4. Settings for the background program
cat > "$ST/computelab.env" <<ENDENV
export BB_COORDINATOR_URL='$URL'
export BB_COORDINATOR_TOKEN_FILE="\$HOME/.bugbrain/coordinator-token"
export BB_CODE_BRANCH='$REF'
export BB_HOME="\$HOME/.bugbrain/worker"
export BB_REPO='$REPO'
export PATH='$NODE_DIR':"\$PATH"
ENDENV
# 5. Check everything before installing: Node, git, files, token, coordinator, a test heartbeat.
say ""
"$best" "$repo/run/preflight.js" --url "$URL" --token-file "$TOKEN_FILE" --install setup </dev/null || {
  say ""; say "Setup stopped. Fix the problem above and run the setup command again."; exit 1; }
# 6. Background program: the launcher (run/worker.sh) keeps the worker up to date and restarts it.
cat > "$ST/computelab-worker.sh" <<'ENDRUN'
#!/bin/sh
. "$HOME/.bugbrain/computelab.env"
echo $$ > "$HOME/.bugbrain/computelab.pid"
exec /bin/sh "$HOME/.bugbrain/worker/run/worker.sh"
ENDRUN
chmod 700 "$ST/computelab-worker.sh"
# Stop an earlier copy first (a job it was running is handed back and runs again later).
SINCE=$(( $(date +%s) * 1000 ))
rm -f "$ST/coord-alive.json"
if command -v systemctl >/dev/null 2>&1; then systemctl --user stop computelab.service >/dev/null 2>&1 </dev/null; fi
[ -f "$ST/worker.pid" ] && kill "$(cat "$ST/worker.pid")" 2>/dev/null
pkill -u "$(id -u)" -f 'run/supervisor.js' >/dev/null 2>&1 </dev/null
sleep 1
started=0
if command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1 </dev/null; then
  METHOD=systemd
  mkdir -p "$HOME/.config/systemd/user"
  cat > "$HOME/.config/systemd/user/computelab.service" <<ENDUNIT
[Unit]
Description=Compute Lab worker
After=network-online.target
StartLimitIntervalSec=0
[Service]
Type=simple
Environment="PATH=$NODE_DIR:/usr/local/bin:/usr/bin:/bin"
Environment=BB_INSTALL=systemd
ExecStart=/bin/sh "$ST/computelab-worker.sh"
Restart=always
RestartSec=30
[Install]
WantedBy=default.target
ENDUNIT
  # Watchdog: every 3 minutes start the service if it is not running (a no-op while it runs).
  cat > "$HOME/.config/systemd/user/computelab-watchdog.service" <<'ENDWD'
[Unit]
Description=Compute Lab watchdog: start the worker if it is not running
[Service]
Type=oneshot
ExecStart=/bin/sh -c 'systemctl --user is-enabled --quiet computelab.service && systemctl --user start computelab.service'
ENDWD
  cat > "$HOME/.config/systemd/user/computelab-watchdog.timer" <<'ENDWT'
[Unit]
Description=Compute Lab watchdog every 3 minutes
[Timer]
OnBootSec=2min
OnUnitActiveSec=3min
AccuracySec=30s
[Install]
WantedBy=timers.target
ENDWT
  if systemctl --user daemon-reload </dev/null && systemctl --user enable computelab.service >/dev/null 2>&1 </dev/null && systemctl --user restart computelab.service </dev/null; then
    systemctl --user enable --now computelab-watchdog.timer >/dev/null 2>&1 </dev/null
    loginctl enable-linger "$(id -un)" >/dev/null 2>&1 </dev/null
    sleep 5
    if systemctl --user is-active --quiet computelab.service </dev/null; then started=1
    else
      say "The systemd service did not stay up. Its last lines:"
      journalctl --user -u computelab.service -n 15 --no-pager 2>/dev/null </dev/null | sed 's/^/    /'
      report "systemd service did not stay running" "Run: journalctl --user -u computelab.service -n 50"
    fi
  else
    say "systemd could not start the service; using a login cron job instead."
  fi
elif [ "$(uname -s)" = Darwin ]; then
  METHOD=launchd
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$HOME/Library/LaunchAgents/info.computelab.worker.plist" <<ENDPLIST
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>Label</key><string>info.computelab.worker</string>
<key>ProgramArguments</key><array><string>/bin/sh</string><string>$ST/computelab-worker.sh</string></array>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>$NODE_DIR:/usr/local/bin:/usr/bin:/bin</string><key>BB_INSTALL</key><string>launchd</string></dict>
<key>StandardOutPath</key><string>$ST/logs/computelab.log</string>
<key>StandardErrorPath</key><string>$ST/logs/computelab.log</string>
</dict></plist>
ENDPLIST
  launchctl bootout "gui/$(id -u)/info.computelab.worker" >/dev/null 2>&1 </dev/null
  if launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/info.computelab.worker.plist" </dev/null; then started=1
  else say "launchd could not start the worker; using a login cron job instead."; fi
fi
if [ "$started" = 0 ]; then
  METHOD=cron
  if command -v systemctl >/dev/null 2>&1; then systemctl --user disable --now computelab.service >/dev/null 2>&1 </dev/null; fi
  if command -v crontab >/dev/null 2>&1; then
    (crontab -l 2>/dev/null </dev/null | grep -v computelab-worker.sh; echo "@reboot BB_INSTALL=cron /bin/sh $ST/computelab-worker.sh >/dev/null 2>&1"; echo "*/3 * * * * BB_INSTALL=cron /bin/sh $ST/computelab-worker.sh >/dev/null 2>&1 # computelab-watchdog") | crontab - 2>/dev/null
  fi
  BB_INSTALL=cron nohup /bin/sh "$ST/computelab-worker.sh" >/dev/null 2>&1 </dev/null &
  sleep 3
fi
cat > "$ST/stop-computelab.sh" <<'ENDSTOP'
#!/bin/sh
if command -v systemctl >/dev/null 2>&1; then systemctl --user stop computelab-watchdog.timer computelab.service >/dev/null 2>&1; fi
launchctl bootout "gui/$(id -u)/info.computelab.worker" >/dev/null 2>&1
(crontab -l 2>/dev/null | grep -v "# computelab-watchdog") | crontab - 2>/dev/null
[ -f "$HOME/.bugbrain/worker.pid" ] && kill "$(cat "$HOME/.bugbrain/worker.pid")" 2>/dev/null
pkill -u "$(id -u)" -f 'run/supervisor.js' >/dev/null 2>&1
rm -f "$HOME/.bugbrain/computelab.pid"
echo "Compute Lab worker stopped. It starts again at the next login or after setup; run uninstall-computelab.sh to remove it."
ENDSTOP
cat > "$ST/uninstall-computelab.sh" <<'ENDUN'
#!/bin/sh
sh "$HOME/.bugbrain/stop-computelab.sh"
if command -v systemctl >/dev/null 2>&1; then systemctl --user disable computelab.service computelab-watchdog.timer >/dev/null 2>&1; fi
rm -rf "$HOME/.config/systemd/user/computelab.service" "$HOME/.config/systemd/user/computelab-watchdog.service" "$HOME/.config/systemd/user/computelab-watchdog.timer" "$HOME/.config/systemd/user/computelab.service.d" "$HOME/Library/LaunchAgents/info.computelab.worker.plist"
(crontab -l 2>/dev/null | grep -v computelab-worker.sh) | crontab - 2>/dev/null
if [ "${1:-}" != "--keep" ]; then rm -f "$HOME/.bugbrain/coordinator-token"; rm -rf "$HOME/.bugbrain/worker"; fi
echo "Compute Lab was removed from this account."
ENDUN
chmod 700 "$ST/stop-computelab.sh" "$ST/uninstall-computelab.sh"
# Only say it is running once the worker process is alive and has checked in with the coordinator.
if ! "$best" "$repo/run/verify-start.js" --url "$URL" --token-file "$TOKEN_FILE" --since "$SINCE" --wait 150 </dev/null; then
  say ""
  say "FAIL: Compute Lab is NOT running yet. Read the FAIL line and Fix above, fix it, and run the setup command again."
  exit 1
fi
say ""
[ -n "$KEPT" ] && say "This computer is already added as $KEPT. Setup kept that entry and restarted its worker; no new entry was added."
say "Compute Lab is running in the background ($METHOD) and starts again after a restart or login."
say "Worker log:  $ST/worker.log"
say "Stop it:     sh $ST/stop-computelab.sh"
say "Remove it:   sh $ST/uninstall-computelab.sh"
say "Your token was saved in $TOKEN_FILE and was not printed."
SH;
}
