#!/bin/sh
# Turn the Linux worker on (same service run/install-linux.sh registers).
systemctl --user enable --now bugbrain-worker.service
echo "BugBrain worker started (or already enabled)."
