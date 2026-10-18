#!/bin/sh
# run/token-check.sh (R61d): does a GitHub token have push rights on TravisA9/bugbrain-neurons?  sh run/token-check.sh DIR
# Token from env BB_TT (never printed). Uses a dry-run push of a new branch name: GitHub checks the token, nothing is created.
# Exit 0 = ok, 1 = refused (bad / expired / read-only token), 2 = could not tell (network etc.; the token is kept).
DIR="${1:-.}"; REPO="${BB_REPO:-https://github.com/TravisA9/bugbrain-neurons.git}"
[ -n "$BB_TT" ] || exit 1
out="$(cd "$DIR" && GIT_TERMINAL_PROMPT=0 git -c credential.helper= -c 'credential.helper=!f() { echo username=x-access-token; echo password=$BB_TT; }; f' push --dry-run -q "$REPO" HEAD:refs/heads/bb-token-check-do-not-use 2>&1)" && exit 0
echo "$out" | grep -Eqi '40[13]|Authentication failed|Invalid username|denied|not granted|could not read Username|terminal prompts disabled|Repository not found' && exit 1
exit 2
