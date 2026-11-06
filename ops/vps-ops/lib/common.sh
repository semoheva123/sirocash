#!/usr/bin/env bash
# Shared helpers for ops tasks. Never print the contents of secret files.
set -u
section() { printf '\n===== %s =====\n' "$*"; }
run() { printf '$ %s\n' "$*"; "$@" 2>&1 || printf '[exit %s]\n' "$?"; }
# Show a systemd unit file while masking inline Environment= values.
show_unit() {
  local u="$1"
  section "unit $u"
  systemctl cat "$u" 2>&1 | sed -E 's/^(\s*Environment=)([A-Za-z0-9_]+)=.*/\1\2=***/'
}
