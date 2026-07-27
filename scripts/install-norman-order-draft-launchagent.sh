#!/bin/zsh
set -euo pipefail

poll_label="com.805shutters.norman-order-drafts"
bridge_label="com.805shutters.norman-order-bridge"
chrome_label="com.805shutters.norman-order-chrome"
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
launch_agents_dir="$HOME/Library/LaunchAgents"
log_dir="$HOME/Library/Logs/805Shutters"
chrome_profile_dir="$HOME/Library/Application Support/805Shutters/NormanChrome"

if ! security find-generic-password -a order-drafts -s 805-norman-worker-secret >/dev/null 2>&1; then
  echo "The Norman worker secret is missing from macOS Keychain." >&2
  exit 1
fi
if [[ ! -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
  echo "Google Chrome is required for Norman saved-draft entry." >&2
  exit 1
fi

mkdir -p "$launch_agents_dir" "$log_dir" "$chrome_profile_dir"

poll_plist="$(mktemp)"
bridge_plist="$(mktemp)"
chrome_plist="$(mktemp)"
trap 'rm -f "$poll_plist" "$bridge_plist" "$chrome_plist"' EXIT

cat > "$poll_plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${poll_label}</string>
  <key>ProgramArguments</key><array>
    <string>/bin/zsh</string><string>-lc</string>
    <string>cd '${repo_dir}' &amp;&amp; npm run orders:norman:next</string>
  </array>
  <key>StartInterval</key><integer>120</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${log_dir}/norman-order-drafts.log</string>
  <key>StandardErrorPath</key><string>${log_dir}/norman-order-drafts-error.log</string>
</dict></plist>
PLIST

cat > "$bridge_plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${bridge_label}</string>
  <key>ProgramArguments</key><array>
    <string>/bin/zsh</string><string>-lc</string>
    <string>cd '${repo_dir}' &amp;&amp; npm run orders:norman:bridge</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${log_dir}/norman-order-bridge.log</string>
  <key>StandardErrorPath</key><string>${log_dir}/norman-order-bridge-error.log</string>
</dict></plist>
PLIST

cat > "$chrome_plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${chrome_label}</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/open</string><string>-na</string><string>Google Chrome</string><string>--args</string>
    <string>--remote-debugging-port=9222</string>
    <string>--user-data-dir=${chrome_profile_dir}</string>
    <string>--no-first-run</string>
    <string>https://www.normanwindowcoverings.com/Login/default.asp</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${log_dir}/norman-order-chrome.log</string>
  <key>StandardErrorPath</key><string>${log_dir}/norman-order-chrome-error.log</string>
</dict></plist>
PLIST

for plist in "$poll_plist" "$bridge_plist" "$chrome_plist"; do
  plutil -lint "$plist"
done

install_agent() {
  local label="$1"
  local source_plist="$2"
  local target_plist="${launch_agents_dir}/${label}.plist"
  cp "$source_plist" "$target_plist"
  launchctl bootout "gui/$(id -u)/${label}" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$target_plist"
  launchctl enable "gui/$(id -u)/${label}"
  launchctl kickstart -k "gui/$(id -u)/${label}"
}

install_agent "$chrome_label" "$chrome_plist"
install_agent "$bridge_label" "$bridge_plist"
install_agent "$poll_label" "$poll_plist"

echo "Installed Norman Chrome, review bridge, and two-minute saved-draft poller."
echo "Log into Norman account RA00743 in the dedicated Chrome window. Final order submission remains disabled."
