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
        . "if not exist \"%DEST%\" mkdir \"%DEST%\"\r\n"
        . "powershell -NoProfile -Command \"\$p = Join-Path \$env:USERPROFILE '.bugbrain\\coordinator-token'; [IO.File]::WriteAllText(\$p, '" . $token . "' + [Environment]::NewLine)\"\r\n"
        . "setx BB_COORDINATOR_URL \"" . $publicUrl . "\" >nul\r\n"
        . "setx BB_COORDINATOR_TOKEN_FILE \"%USERPROFILE%\\.bugbrain\\coordinator-token\" >nul\r\n"
        . "set \"BB_COORDINATOR_URL=" . $publicUrl . "\"\r\n"
        . "set \"BB_COORDINATOR_TOKEN_FILE=%USERPROFILE%\\.bugbrain\\coordinator-token\"\r\n"
        . "if exist \"%REPO%\\.git\" (\r\n"
        . "  git -C \"%REPO%\" fetch --depth 1 origin " . $ref . "\r\n"
        . "  git -C \"%REPO%\" checkout --force FETCH_HEAD\r\n"
        . ") else (\r\n"
        . "  git clone --depth 1 --branch " . $ref . " " . $repo . " \"%REPO%\"\r\n"
        . ")\r\n"
        . "if errorlevel 1 (\r\n"
        . "  echo Could not download the worker files.\r\n"
        . "  pause\r\n"
        . "  exit /b 1\r\n"
        . ")\r\n"
        . "powershell -NoProfile -Command \"\$repo = Join-Path \$env:USERPROFILE '.bugbrain\\worker'; \$p = Start-Process -FilePath node -ArgumentList 'run/supervisor.js' -WorkingDirectory \$repo -WindowStyle Minimized -PassThru; Set-Content -Path (Join-Path \$env:USERPROFILE '.bugbrain\\computelab.pid') -Value \$p.Id\"\r\n"
        . "echo Compute Lab is running in the background.\r\n"
        . "echo To stop it, open Command Prompt and run:\r\n"
        . "echo   taskkill /PID %%PID%% /T\r\n"
        . "echo using the number in %%USERPROFILE%%\\.bugbrain\\computelab.pid\r\n"
        . "echo You can also turn this computer Off on the My computer page.\r\n"
        . "echo Your token was saved and was not printed here.\r\n"
        . "pause\r\n";
}

function setup_unix(string $token, string $publicUrl, string $repo, string $ref): string
{
    $stop = "#!/bin/sh\n"
        . "if [ -f \"\$HOME/.bugbrain/computelab.pid\" ]; then\n"
        . "  kill \"\$(cat \"\$HOME/.bugbrain/computelab.pid\")\" 2>/dev/null || true\n"
        . "  rm -f \"\$HOME/.bugbrain/computelab.pid\"\n"
        . "fi\n"
        . "echo \"Compute Lab worker stopped. A job it already started can finish.\"\n";
    return "#!/bin/sh\n"
        . "set -eu\n"
        . "if ! command -v node >/dev/null 2>&1; then\n"
        . "  echo \"Node.js is not installed.\"\n"
        . "  echo \"Install it from https://nodejs.org/ and run this file again.\"\n"
        . "  exit 1\n"
        . "fi\n"
        . "if ! command -v git >/dev/null 2>&1; then\n"
        . "  echo \"Git is not installed.\"\n"
        . "  echo \"Install it from https://git-scm.com/ and run this file again.\"\n"
        . "  exit 1\n"
        . "fi\n"
        . "major=\$(node -p \"process.versions.node.split('.')[0]\")\n"
        . "if [ \"\$major\" -lt 18 ]; then\n"
        . "  echo \"Node.js 18 or newer is required. Install it from https://nodejs.org/ and run this file again.\"\n"
        . "  exit 1\n"
        . "fi\n"
        . "umask 077\n"
        . "mkdir -p \"\$HOME/.bugbrain\"\n"
        . "printf '%s\\n' '" . $token . "' > \"\$HOME/.bugbrain/coordinator-token\"\n"
        . "cat > \"\$HOME/.bugbrain/computelab.env\" << 'ENDENV'\n"
        . "export BB_COORDINATOR_URL='" . $publicUrl . "'\n"
        . "export BB_COORDINATOR_TOKEN_FILE=\"\$HOME/.bugbrain/coordinator-token\"\n"
        . "ENDENV\n"
        . "set -a\n"
        . ". \"\$HOME/.bugbrain/computelab.env\"\n"
        . "set +a\n"
        . "repo=\"\$HOME/.bugbrain/worker\"\n"
        . "if [ -d \"\$repo/.git\" ]; then\n"
        . "  git -C \"\$repo\" fetch --depth 1 origin '" . $ref . "'\n"
        . "  git -C \"\$repo\" checkout --force FETCH_HEAD\n"
        . "else\n"
        . "  git clone --depth 1 --branch '" . $ref . "' '" . $repo . "' \"\$repo\"\n"
        . "fi\n"
        . "cd \"\$repo\"\n"
        . "nohup node run/supervisor.js >> \"\$HOME/.bugbrain/computelab.log\" 2>&1 &\n"
        . "echo \$! > \"\$HOME/.bugbrain/computelab.pid\"\n"
        . "cat > \"\$HOME/.bugbrain/stop-computelab.sh\" << 'ENDSTOP'\n"
        . $stop
        . "ENDSTOP\n"
        . "chmod +x \"\$HOME/.bugbrain/stop-computelab.sh\"\n"
        . "echo \"Compute Lab is running.\"\n"
        . "echo \"To stop it later, run: \$HOME/.bugbrain/stop-computelab.sh\"\n"
        . "echo \"Your token was saved and was not printed here.\"\n";
}
