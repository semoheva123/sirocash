#!/usr/bin/env bash
# Read-only diagnostics. No secrets are printed.
source "$(dirname "$0")/../lib/common.sh"

section "host"; run hostname; run uname -a; run cat /etc/os-release; run uptime; run date -u
section "cpu / memory / swap / disk"; run nproc; run free -m; run swapon --show; run df -h /; run cat /proc/pressure/memory
section "top memory processes"; ps -eo user,pid,rss,pcpu,etimes,cmd --sort=-rss | head -15
section "node"; run which node; run node -v; run npm -v; ps -o user,pid,rss,cmd -C node
section "listening ports"; run sudo ss -tlnp
section "firewall"; run sudo ufw status verbose; run sudo iptables -S INPUT
section "ssh config (auth settings only)"
grep -R -h -i -E '^\s*(PasswordAuthentication|PermitRootLogin|PubkeyAuthentication|KbdInteractiveAuthentication|Port)\b' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/ 2>/dev/null | sort | uniq -c
section "users with shell"; awk -F: '$7 ~ /sh$/ {print $1, $7}' /etc/passwd
section "sudoers.d"; sudo ls -la /etc/sudoers.d; sudo grep -R -h -v '^#' /etc/sudoers.d 2>/dev/null
section "running services (non-system)"
systemctl list-units --type=service --state=running --no-pager | grep -v -E 'systemd|dbus|getty|cron.service|rsyslog|polkit|udisks|snapd|multipathd|networkd|resolved|ModemManager|unattended|qemu|acpid|irqbalance|ssh.service'
section "timers"; systemctl list-timers --all --no-pager
section "crontabs"; run sudo bash -c 'for u in $(cut -d: -f1 /etc/passwd); do crontab -l -u $u 2>/dev/null | sed "s/^/[$u] /"; done'; run ls -la /etc/cron.d
section "pm2 (if any)"; run bash -c 'command -v pm2 && pm2 ls'; sudo -u "$(ps -o user= -C node | head -1)" bash -c 'command -v pm2 >/dev/null && pm2 ls' 2>/dev/null || true
section "reverse proxy"
run bash -c 'command -v caddy && caddy version'; run bash -c 'command -v nginx && nginx -v'
[ -f /etc/caddy/Caddyfile ] && { section "/etc/caddy/Caddyfile"; cat /etc/caddy/Caddyfile; }
[ -d /etc/nginx/sites-enabled ] && { section "nginx sites-enabled"; cat /etc/nginx/sites-enabled/* 2>/dev/null; }
section "app units"
for u in $(systemctl list-unit-files --type=service --no-legend | awk '{print $1}' | grep -i -E 'opx|operix|siro|node|app|caddy|nginx|pm2|actions.runner'); do show_unit "$u"; systemctl show "$u" -p MainPID,ActiveState,Restart,MemoryMax,MemoryCurrent,User,NRestarts --no-pager; done
section "app directories"; run ls -la /opt /srv /var/www /home/*/ 2>/dev/null
section "env files present (names/permissions only)"; run bash -c 'sudo ls -la /etc/*.env /opt/*/.env /home/*/*/.env /srv/*/.env 2>/dev/null'
section "local health"; run curl -s -m 5 -o /dev/null -w 'https://operix.website -> %{http_code} server=%header{server}\n' https://operix.website/api/health
for p in 3000 3001 8080 8000 4000 5000; do curl -s -m 3 -o /dev/null -w "127.0.0.1:$p -> %{http_code}\n" http://127.0.0.1:$p/api/health 2>/dev/null; done
section "auto updates"; run bash -c 'dpkg -l unattended-upgrades fail2ban 2>/dev/null | grep ^ii'; run cat /etc/apt/apt.conf.d/20auto-upgrades
section "recent app log (last 40 lines, masked)"
for u in $(systemctl list-unit-files --type=service --no-legend | awk '{print $1}' | grep -i -E 'opx|operix|siro'); do sudo journalctl -u "$u" -n 40 --no-pager 2>&1 | sed -E 's/([A-Za-z0-9_]*(KEY|SECRET|TOKEN|PASSWORD)[A-Za-z0-9_]*=)\S+/\1***/g'; done
section "dmesg oom"; sudo dmesg -T 2>/dev/null | grep -i -E 'out of memory|oom' | tail -5
echo; echo "diagnose done"
