#!/usr/bin/env bash
# Install / reinstall the email-worker as a launchd LaunchAgent.
#
# Usage:
#   ./apps/email-worker/install-launchd.sh             # install + start
#   ./apps/email-worker/install-launchd.sh --uninstall # stop + remove
#
# Logs:
#   tail -f /tmp/gennext-email-worker.log
#   tail -f /tmp/gennext-email-worker.err

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEMPLATE="$SCRIPT_DIR/com.gennext.email-worker.plist"
LABEL="com.gennext.email-worker"
TARGET="$HOME/Library/LaunchAgents/${LABEL}.plist"

if [[ "${1:-}" == "--uninstall" ]]; then
  if [[ -f "$TARGET" ]]; then
    launchctl unload -w "$TARGET" 2>/dev/null || true
    rm -f "$TARGET"
    echo "已卸载 $LABEL"
  else
    echo "未安装,无需卸载"
  fi
  exit 0
fi

NODE_PATH="$(command -v node || true)"
if [[ -z "$NODE_PATH" ]]; then
  echo "错误: 找不到 node。请安装 Node.js 后重试。" >&2
  exit 1
fi

if [[ ! -f "$REPO_ROOT/.env.local" ]]; then
  echo "警告: $REPO_ROOT/.env.local 不存在,worker 将无法读取配置" >&2
fi

mkdir -p "$HOME/Library/LaunchAgents"

# 替换占位符
sed \
  -e "s|__NODE_PATH__|${NODE_PATH}|g" \
  -e "s|__REPO_ROOT__|${REPO_ROOT}|g" \
  "$TEMPLATE" > "$TARGET"

# 已加载则先卸载,再加载
launchctl unload -w "$TARGET" 2>/dev/null || true
launchctl load -w "$TARGET"

echo "已安装并启动 $LABEL"
echo "  Node:     $NODE_PATH"
echo "  Repo:     $REPO_ROOT"
echo "  Plist:    $TARGET"
echo "  日志:     tail -f /tmp/gennext-email-worker.log"
echo "  错误:     tail -f /tmp/gennext-email-worker.err"
