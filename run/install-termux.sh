#!/data/data/com.termux/files/usr/bin/sh
# run/install-termux.sh (R61): one-time setup of an always-on BugBrain worker on Android (Termux + Termux:Boot + Termux:API).
#   sh run/install-termux.sh [worker-name]
# Asks once for the GitHub token if ~/.bugbrain/token is missing (an old ~/.bugbrain_env token is reused). Safe to re-run.
set -e
ST="$HOME/.bugbrain"; DIR="${BB_HOME:-$HOME/bugbrain-neurons}"
pkg install -y git nodejs-lts termux-api >/dev/null 2>&1 || pkg install -y git nodejs termux-api
mkdir -p "$ST"; chmod 700 "$ST"
[ -d "$DIR/.git" ] || git clone -q -b neuro/distributed-queue https://github.com/TravisA9/bugbrain-neurons.git "$DIR"
ask_token() {   # R61d: the token must have push rights; a refused token is never saved (asks again, up to 3 times)
  for n in 1 2 3; do
    T0="$BB_DQ_TOKEN"; [ -z "$T0" ] && [ -f "$HOME/.bugbrain_env" ] && T0="$(sed -n "s/^export BB_DQ_TOKEN='\(.*\)'$/\1/p" "$HOME/.bugbrain_env")"
    if [ -n "$T0" ] && [ $n = 1 ]; then T="$T0"; else printf 'Paste the GitHub token (input hidden): '; stty -echo 2>/dev/null; read -r T; stty echo 2>/dev/null; echo; fi
    [ -n "$T" ] || { echo "No token given; stopping."; exit 1; }
    BB_TT="$T" sh "$DIR/run/token-check.sh" "$DIR" && rc=0 || rc=$?
    if [ $rc = 1 ]; then echo "!! GitHub refused that token (wrong, expired, or no Contents read/write on TravisA9/bugbrain-neurons). Try again."; continue; fi
    [ $rc = 2 ] && echo "(could not reach GitHub to check the token; saving it anyway)"
    ( umask 077; printf '%s\n' "$T" > "$ST/token" ); chmod 600 "$ST/token"; T=""; echo "token checked and saved in $ST/token (only you can read it)"; return 0
  done
  echo "Stopping: no working token. Make a fine-grained token with Contents read/write on TravisA9/bugbrain-neurons and run this again."; exit 1
}
if [ -s "$ST/token" ]; then
  BB_TT="$(cat "$ST/token")" sh "$DIR/run/token-check.sh" "$DIR" && rc=0 || rc=$?
  if [ $rc = 1 ]; then echo "!! The saved token in $ST/token is refused by GitHub; please paste a new one."; rm -f "$ST/token"; ask_token; else echo "saved token OK"; fi
else ask_token; fi
if [ -n "$1" ]; then printf '%s\n' "$1" > "$ST/worker-name"
elif [ ! -s "$ST/worker-name" ] && [ -f "$HOME/.bugbrain_env" ]; then sed -n "s/^export BB_WORKER='\(.*\)'$/\1/p" "$HOME/.bugbrain_env" > "$ST/worker-name"; [ -s "$ST/worker-name" ] || rm -f "$ST/worker-name"; fi
cp "$DIR/run/worker.sh" "$ST/worker.sh"; chmod 700 "$ST/worker.sh"
mkdir -p "$HOME/.termux/boot"
cat > "$HOME/.termux/boot/bugbrain-worker" <<BOOT
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
nohup sh $ST/worker.sh >/dev/null 2>&1 &
BOOT
chmod 700 "$HOME/.termux/boot/bugbrain-worker"
pkill -f 'bugbrain/worker.sh' 2>/dev/null || true; pkill -f 'run/supervisor.js' 2>/dev/null || true; pkill -f 'run/dq.js' 2>/dev/null || true; pkill -f 'run/queue.js' 2>/dev/null || true   # old R48 worker (termux_start.sh)
sh "$HOME/.termux/boot/bugbrain-worker"
echo "installed. Starts at boot via Termux:Boot (install it from F-Droid and open it once). Log: tail -f $ST/worker.log"
