#!/usr/bin/env bash

# Cherry-pick extensions/skills into ~/.pi/agent.
set -euo pipefail
shopt -s nullglob

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
AGENT_DIR="${PI_AGENT_DIR:-$HOME/.pi/agent}"

# Extra config an extension needs, as "<repo-src> <agent-target>".
config_for() {
  case "$1" in
    extensions/pi-mcp)      echo "config/.mcp.json .mcp.json" ;;
    extensions/pi-dispatch) echo "config/agents dispatch/agents" ;;
  esac
}

# Symlink into ~/.pi/agent, never clobbering a path we don't own.
link() {
  local src=$1 target=$2
  mkdir -p "${target%/*}"
  if [ -e "$target" ] || [ -L "$target" ]; then
    printf 'refusing to replace %s\n' "$target" >&2
    return 1
  fi
  ln -s "$src" "$target"
}

# Remove a link only if we created it (points back into this repo).
unlink() {
  [ -L "$1" ] || return 0
  case "$(readlink "$1")" in "$REPO"/*) rm "$1" ;; esac
}

items=()
for pkg in "$REPO"/extensions/*/package.json; do
  grep -q '"pi-package"' "$pkg" || continue
  items+=("extensions/$(basename "${pkg%/*}")")
done
for skill in "$REPO"/skills/*/SKILL.md; do
  items+=("skills/$(basename "${skill%/*}")")
done

for i in "${!items[@]}"; do printf '%d) %s\n' "$((i + 1))" "${items[$i]}"; done
printf '\nInstall comma-separated numbers [all]: '
read -r choice

chosen=()
case "${choice:-all}" in
  all) chosen=("${items[@]}") ;;
  *)   IFS=, read -ra picks <<< "$choice"
       for p in "${picks[@]}"; do chosen+=("${items[$((p - 1))]}"); done ;;
esac

# Extensions ship default config, but a user may prefer their own, so ask before linking it.
with_config=1
for item in "${chosen[@]}"; do
  [ -n "$(config_for "$item")" ] || continue
  printf 'Link bundled config for selected extensions? [Y/n]: '
  read -r reply
  case "${reply:-y}" in [nN]*) with_config=0 ;; esac
  break
done

# Reruns are authoritative: forget every link we might have made, then relink the pick.
mkdir -p "$AGENT_DIR/extensions" "$AGENT_DIR/skills"
for item in "${items[@]}"; do
  read -r _ target <<< "$(config_for "$item")"
  unlink "$AGENT_DIR/$item"
  [ -z "$target" ] || unlink "$AGENT_DIR/$target"
done

for item in "${chosen[@]}"; do
  case "$item" in extensions/*) (cd "$REPO/$item" && npm install) ;; esac
  link "$REPO/$item" "$AGENT_DIR/$item"
  read -r src target <<< "$(config_for "$item")"
  if [ "$with_config" = 1 ] && [ -n "$target" ]; then link "$REPO/$src" "$AGENT_DIR/$target"; fi
done
