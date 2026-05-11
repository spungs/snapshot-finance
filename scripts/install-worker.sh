#!/usr/bin/env bash
# KIS WebSocket worker 를 macOS launchd 에 등록 — 로그인 시 자동 시작 + 슬립 방지 (caffeinate) + 충돌 시 재시작.
#
# 사용:
#   ./scripts/install-worker.sh        # 설치 + 시작
#   ./scripts/uninstall-worker.sh      # 제거
#
# 로그:
#   stdout: ~/Library/Logs/snapshot-kis-ws.log
#   stderr: ~/Library/Logs/snapshot-kis-ws.err.log

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.snapshot.kis-ws"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="$HOME/Library/Logs"

NPM_BIN="$(command -v npm || true)"
CAFFEINATE_BIN="$(command -v caffeinate || echo /usr/bin/caffeinate)"
NODE_BIN="$(command -v node || true)"

if [ -z "$NPM_BIN" ] || [ -z "$NODE_BIN" ]; then
    echo "ERROR: npm 또는 node 가 PATH 에 없습니다. nvm 사용자는 'nvm use --lts' 등으로 활성화 후 재시도하세요."
    exit 1
fi
if [ ! -x "$CAFFEINATE_BIN" ]; then
    echo "ERROR: caffeinate 명령을 찾을 수 없습니다. macOS 가 맞나요?"
    exit 1
fi

NODE_BIN_DIR="$(dirname "$NODE_BIN")"
NPM_BIN_DIR="$(dirname "$NPM_BIN")"
PATH_ENTRY="${NODE_BIN_DIR}:${NPM_BIN_DIR}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"

mkdir -p "$LOG_DIR"
mkdir -p "$(dirname "$PLIST_PATH")"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>

    <key>WorkingDirectory</key>
    <string>${PROJECT_DIR}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${CAFFEINATE_BIN}</string>
        <string>-i</string>
        <string>${NPM_BIN}</string>
        <string>run</string>
        <string>worker:dev</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${PATH_ENTRY}</string>
        <key>HOME</key>
        <string>${HOME}</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
        <key>Crashed</key>
        <true/>
    </dict>

    <key>ThrottleInterval</key>
    <integer>30</integer>

    <key>StandardOutPath</key>
    <string>${LOG_DIR}/snapshot-kis-ws.log</string>

    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/snapshot-kis-ws.err.log</string>
</dict>
</plist>
EOF

# 기존 등록 해제 (있으면 무시)
launchctl unload "$PLIST_PATH" 2>/dev/null || true

# 등록 + 즉시 시작
launchctl load "$PLIST_PATH"

echo "[installed] ${LABEL}"
echo "  plist  : ${PLIST_PATH}"
echo "  stdout : ${LOG_DIR}/snapshot-kis-ws.log"
echo "  stderr : ${LOG_DIR}/snapshot-kis-ws.err.log"
echo ""
echo "동작 확인:"
echo "  tail -f ${LOG_DIR}/snapshot-kis-ws.log"
echo ""
echo "수동 재시작:"
echo "  launchctl unload ${PLIST_PATH} && launchctl load ${PLIST_PATH}"
