#!/usr/bin/env bash
# install-worker.sh 로 등록된 launchd 작업 제거.

set -euo pipefail

LABEL="com.snapshot.kis-ws"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"

if [ ! -f "$PLIST_PATH" ]; then
    echo "[skip] plist 가 없습니다: $PLIST_PATH"
    exit 0
fi

launchctl unload "$PLIST_PATH" 2>/dev/null || true
rm -f "$PLIST_PATH"

echo "[uninstalled] ${LABEL}"
echo "로그는 보존: ~/Library/Logs/snapshot-kis-ws*.log (수동 삭제 가능)"
