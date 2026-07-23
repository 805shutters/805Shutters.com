#!/bin/zsh
set -euo pipefail

label="com.805shutters.norman-order-drafts"
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
plist_path="$HOME/Library/LaunchAgents/${label}.plist"
log_dir="$HOME/Library/Logs/805Shutters"

mkdir -p "$HOME/Library/LaunchAgents" "$log_dir"
temp_plist="$(mktemp)"
trap 'rm -f "$temp_plist"' EXIT

cat > "$temp_plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>cd '${repo_dir}' &amp;&amp; npm run orders:norman:next</string>
  </array>
  <key>StartInterval</key><integer>120</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${log_dir}/norman-order-drafts.log</string>
  <key>StandardErrorPath</key><string>${log_dir}/norman-order-drafts-error.log</string>
</dict>
</plist>
PLIST

plutil -lint "$temp_plist"
cp "$temp_plist" "$plist_path"
launchctl bootout "gui/$(id -u)/${label}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$plist_path"
launchctl enable "gui/$(id -u)/${label}"
launchctl kickstart -k "gui/$(id -u)/${label}"
echo "Installed ${label}; polling every 120 seconds."
