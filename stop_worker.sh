#!/bin/sh
# Turn the Linux worker off. The service stops. A test running here is interrupted.
# The job file stays in the queue. If the worker receives the stop signal, it gives the job back.
systemctl --user disable --now bugbrain-worker.service
echo "BugBrain worker stopped."
