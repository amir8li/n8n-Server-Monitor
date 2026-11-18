#!/usr/bin/env bash

# ================================================================
# CONFIGURATION
# ================================================================
SERVER_ID="web-server-01"
WEBHOOK_URL="https://your-n8n-domain.com/webhook/server-audit"
OUTPUT_FILE="$HOME/server_monitor_output.txt"
TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S %Z")

# ================================================================
# GATHER AUDIT DATA
# ================================================================
AUDIT_OUTPUT=$(
  echo "================================================================"
  echo "              SERVER HEALTH AUDIT REPORT                        "
  echo "              Generated: $TIMESTAMP                            "
  echo "================================================================"

  echo -e "\n---------------- [1. UPTIME & LOAD AVERAGE] ----------------"
  uptime

  echo -e "\n---------------- [2. LOGGED IN USERS (who)] ----------------"
  who -H

  echo -e "\n---------------- [3. DISK SPACE (df -h)] -------------------"
  df -h -x tmpfs -x devtmpfs -x squashfs

  echo -e "\n---------------- [4. DIRECTORY DISK USAGE] -----------------"
  echo "-> Home Directory Total (du -sh):"
  du -sh "$HOME" 2>/dev/null || echo "Unable to read home dir"
  echo -e "\n-> Root Level Subdirectory Sizes (du -h -d 1):"
  du -h -d 1 / 2>/dev/null | sort -hr | head -n 10

  echo -e "\n---------------- [5. MEMORY & SWAP (free -h)] --------------"
  free -h

  echo -e "\n---------------- [6. TOP PROCESSES (htop snapshot)] --------"
  echo "-> Top 5 CPU-Consuming Processes:"
  ps aux --sort=-%cpu | head -n 6
  echo -e "\n-> Top 5 Memory-Consuming Processes:"
  ps aux --sort=-%mem | head -n 6

  echo -e "\n---------------- [7. FAIL2BAN SECURITY STATUS] -------------"
  echo "-> Service Status:"
  systemctl status fail2ban --no-pager 2>/dev/null || echo "Fail2ban service check failed (requires sudo or not installed)"
  echo -e "\n-> Active Jails & Bans:"
  fail2ban-client status 2>/dev/null || echo "fail2ban-client not accessible"
  echo -e "\n-> Recent Log Entries (Last 30 lines of /var/log/fail2ban.log):"
  tail -n 30 /var/log/fail2ban.log 2>/dev/null || echo "Unable to read /var/log/fail2ban.log (requires read permission)"

  echo -e "\n================================================================"
  echo "                       END OF REPORT                            "
  echo "================================================================"
)

echo "$AUDIT_OUTPUT" > "$OUTPUT_FILE"
echo "Local report saved to: $OUTPUT_FILE"

PAYLOAD=$(python3 -c '
import json, sys
data = {
    "server_id": sys.argv[1],
    "audit_data": sys.stdin.read()
}
print(json.dumps(data))
' "$SERVER_ID" <<< "$AUDIT_OUTPUT")

curl -s -X POST "$WEBHOOK_URL" -H "Content-Type: application/json" -d "$PAYLOAD"
echo ""
echo "Audit data sent to n8n."
