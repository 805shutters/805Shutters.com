#!/bin/zsh
set -euo pipefail

label="com.805shutters.hermes-crm-feedback"
repo_dir="${HERMES_805_CRM_WORKSPACE:-$(cd "$(dirname "$0")/.." && pwd)}"
worker_path="$repo_dir/scripts/hermes-805-crm-feedback-worker.mjs"
launch_agents_dir="$HOME/Library/LaunchAgents"
logs_dir="$HOME/.hermes/logs"
plist_path="$launch_agents_dir/$label.plist"

mkdir -p "$launch_agents_dir" "$logs_dir"

/usr/bin/plutil -create xml1 "$plist_path"
/usr/bin/plutil -insert Label -string "$label" "$plist_path"
/usr/bin/plutil -insert ProgramArguments -json "[\"/usr/bin/env\",\"node\",\"$worker_path\"]" "$plist_path"
/usr/bin/plutil -insert WorkingDirectory -string "$repo_dir" "$plist_path"
/usr/bin/plutil -insert StartInterval -integer 60 "$plist_path"
/usr/bin/plutil -insert RunAtLoad -bool true "$plist_path"
/usr/bin/plutil -insert StandardOutPath -string "$logs_dir/crm-feedback-worker.log" "$plist_path"
/usr/bin/plutil -insert StandardErrorPath -string "$logs_dir/crm-feedback-worker.error.log" "$plist_path"
/usr/bin/plutil -insert EnvironmentVariables -json "{\"PATH\":\"/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin\",\"HERMES_805_CRM_WORKSPACE\":\"$repo_dir\",\"HERMES_805_RELEASE_ENABLED\":\"false\"}" "$plist_path"
/bin/chmod 600 "$plist_path"

/bin/launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
/bin/launchctl bootstrap "gui/$(id -u)" "$plist_path"
echo "Installed $label with release execution disabled."
