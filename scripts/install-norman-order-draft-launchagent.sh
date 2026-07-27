#!/bin/zsh
set -euo pipefail

# The ordering workflow is intentionally supervised through the user's existing
# Chrome profile and the Codex Chrome connection. Dedicated debug profiles and
# unattended background portal entry are disabled.
labels=(
  "com.805shutters.norman-order-drafts"
  "com.805shutters.norman-order-bridge"
  "com.805shutters.norman-order-chrome"
)
launch_agents_dir="$HOME/Library/LaunchAgents"
disabled_dir="$HOME/Library/Application Support/805Shutters/DisabledLaunchAgents"
timestamp="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$disabled_dir"
for label in "${labels[@]}"; do
  launchctl bootout "gui/$(id -u)/${label}" 2>/dev/null || true
  plist="${launch_agents_dir}/${label}.plist"
  if [[ -f "$plist" ]]; then
    mv "$plist" "${disabled_dir}/${label}.${timestamp}.plist"
  fi
done

echo "Disabled dedicated manufacturer-order browser and background workers."
echo "Use Open Ordering Agent in Chrome; Codex will operate the existing Chrome profile."
