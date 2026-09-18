#!/usr/bin/env bash
# Restart the running dsh web profile (the GUI at http://127.0.0.1:3080).
#
# The dsh GUI for the "web" profile is launched with `pnpm dsh web` from the
# deepseek-harness checkout. This script stops that running instance cleanly
# (the web app process, its pnpm/tsx wrappers, and the dsh-doctor supervisor)
# and relaunches it detached with output captured to a log, then waits for the
# port to come back up.
#
# Usage:
#   scripts/restart-dsh.sh            # restart the web profile
#   scripts/restart-dsh.sh --no-open  # also pass through extra flags (default --no-open)
#   DSH_LOG=path scripts/restart-dsh.sh
#
# Safe to re-run: it only acts on processes whose command lines match this
# profile, so unrelated dsh/onedev processes are left untouched.

set -u

HARNESS="${DSH_HARNESS:-/home/cyrene/codes/deepseek-harness}"
PROFILE="${DSH_PROFILE:-web}"
LOG="${DSH_LOG:-/tmp/dsh-web.log}"
FLAGS="${*:---no-open}"

die() { echo "[restart-dsh] $*" >&2; exit 1; }

[ -d "$HARNESS" ] || die "harness dir not found: $HARNESS"

echo "[restart-dsh] stopping current '$PROFILE' dsh web instance…"

# Collect PIDs by matching the exact process shape of the web profile:
#   node .../pnpm dsh web
#   node .../bin.ts web             (the actual app / webserver)
#   node .../dsh-doctor/lib/cli.mjs supervisor
PIDS=$(pgrep -f "dsh ${PROFILE}|pin bin\.ts ${PROFILE}|dsh-doctor/lib/cli\.mjs supervisor" 2>/dev/null || true)

if [ -n "$PIDS" ]; then
  echo "[restart-dsh] terminating: $PIDS"
  # TERM the app/server first so the webserver stops serving, then the rest.
  kill $PIDS 2>/dev/null || true
  sleep 1
  # SIGKILL anything that survived.
  for p in $PIDS; do
    if kill -0 "$p" 2>/dev/null; then kill -9 "$p" 2>/dev/null || true; fi
  done
fi

# Give the port a moment to release before relaunching.
sleep 1

echo "[restart-dsh] relaunching: pnpm dsh $PROFILE $FLAGS (log: $LOG)"
cd "$HARNESS" || die "cannot cd to $HARNESS"

# Launch detached: nohup + background so it survives this script's exit.
nohup pnpm dsh "$PROFILE" $FLAGS >>"$LOG" 2>&1 &
LAUNCHER=$!
disown "$LAUNCHER" 2>/dev/null || true

# The app binds 127.0.0.1:3080 by default; poll for readiness (up to ~40s).
URL="http://127.0.0.1:3080"
echo "[restart-dsh] waiting for $URL …"
for _ in $(seq 1 40); do
  if curl -sf -o /dev/null "$URL" 2>/dev/null; then
    echo "[restart-dsh] OK: $URL is up. New log appended to $LOG"
    exit 0
  fi
  if ! kill -0 "$LAUNCHER" 2>/dev/null; then
    echo "[restart-dsh] ERROR: launcher exited early; tail of $LOG:" >&2
    tail -40 "$LOG" >&2
    exit 1
  fi
  sleep 1
done

echo "[restart-dsh] WARN: port not reachable within timeout; launcher still running." >&2
echo "[restart-dsh] inspect $LOG; the GUI may need a refresh." >&2
exit 1