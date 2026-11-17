'use strict';
/* run/preflight.js: the last step of the Compute Lab setup files (Linux, Mac, Windows).
 * Checks Node.js, git, the checkout, the token file, that the coordinator answers, and that it accepts a test
 * heartbeat. Prints one plain-English line per check and a result, and sends the result to the coordinator as a
 * "setup" diagnostics report (token scrubbed) so the owner can see why a computer never started.
 * Usage: node run/preflight.js --url <coordinator> --token-file <file> [--install systemd|launchd|cron|task-scheduler]
 * Exit 0 when everything passed, 1 when something must be fixed. Runs on old Node versions on purpose. */
var fs = require('fs'), path = require('path'), cp = require('child_process');
var D = require('./diag.js');
var ROOT = path.resolve(__dirname, '..');

function arg(name, dflt) { var i = process.argv.indexOf('--' + name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt; }
var base = arg('url', process.env.BB_COORDINATOR_URL || '');
var tokenFile = arg('token-file', process.env.BB_COORDINATOR_TOKEN_FILE || path.join(D.STATE, 'coordinator-token'));
var install = arg('install', process.env.BB_INSTALL || '');
if (install) process.env.BB_INSTALL = install;

var checks = [], hint = '', firstFail = '';
function check(name, ok, detail, fix) {
  checks.push({ name: name, ok: !!ok, detail: detail || '' });
  console.log((ok ? '  OK    ' : '  FAIL  ') + name + (detail ? ': ' + detail : ''));
  if (!ok && !firstFail) { firstFail = name + ': ' + detail; hint = fix || ''; }
}

function finish(reach) {
  var ok = !firstFail;
  var summary = ok ? 'Setup finished: all checks passed' : 'Setup failed: ' + firstFail;
  var report = D.collect({ kind: 'setup', ok: ok, summary: summary.slice(0, 280), checks: checks, hint: hint, reach: reach, log: D.logTail() });
  console.log('');
  console.log(ok ? 'Result: all checks passed. Next, setup installs and starts the worker and waits for it to check in.'
                 : 'Result: setup did not finish. ' + firstFail + (hint ? '\nFix: ' + hint : ''));
  var token = D.tokenFrom(tokenFile);
  if (reach === false || !token) { process.exitCode = ok ? 0 : 1; return; }
  D.post(base, token, report, function (err, code) {
    if (err || code !== 200) console.log('(Could not send this result to the coordinator' + (err ? ': ' + err.message : ', HTTP ' + code) + '.)');
    else console.log('This result was sent to the coordinator, so the owner can see it too.');
    process.exitCode = ok ? 0 : 1;
  }, { force: true });
}

console.log('Compute Lab setup check');
var major = D.nodeMajor();
check('Node.js', major >= 18, process.version + (major >= 18 ? '' : ' is too old (18 or newer is needed)'),
  'Install Node.js 20 LTS from https://nodejs.org/ (or run: nvm install 20), then run the setup command again.');
var gitv = '';
try { gitv = cp.execFileSync('git', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20000 }).trim(); } catch (e) {}
check('git', !!gitv, gitv || 'not found', 'Install git (Debian/Ubuntu: sudo apt install git), then run the setup command again.');
var haveCode = fs.existsSync(path.join(ROOT, 'run', 'coord.js')) && fs.existsSync(path.join(ROOT, 'hosting', 'computelab', 'PROTOCOL.txt'));
var sha = D.gitHead();
check('Worker files', haveCode, haveCode ? 'commit ' + (sha ? sha.slice(0, 7) : 'unknown') + ' in ' + ROOT : 'the download in ' + ROOT + ' is incomplete',
  'Delete ' + ROOT + ' and run the setup command again.');
var token = D.tokenFrom(tokenFile);
check('Token file', !!token, token ? tokenFile : 'missing or damaged: ' + tokenFile, 'Run the setup command again. It saves the token.');
if (!base) { check('Coordinator address', false, 'BB_COORDINATOR_URL is not set', 'Run the setup command again.'); finish(null); }
else if (!token) finish(null);
else {
  var hash = D.protocolHash();
  D.request(base, token, '/api/v1/heartbeat', { codeHash: hash, control: true, setupCheck: true }, function (err, code, text) {
    if (err) {
      check('Coordinator reachable', false, base + ' did not answer (' + err.message + ')', 'Check the internet connection, proxy, or firewall on this computer, then run the setup command again.');
      return finish(false);
    }
    check('Coordinator reachable', true, base);
    if (code === 200) check('Test heartbeat', true, 'accepted');
    else if (code === 401) check('Test heartbeat', false, 'the coordinator does not know this token (revoked?)', 'Get a new setup command from the Compute Lab page.');
    else if (code === 409) check('Test heartbeat', false, 'protocol mismatch: this download does not match the coordinator (PROTOCOL ' + hash.slice(0, 12) + ')', 'Run the setup command again to download the current worker.');
    else check('Test heartbeat', false, 'HTTP ' + code + ' ' + String(text || '').slice(0, 120), 'Try again in a few minutes.');
    finish(true);
  });
}
