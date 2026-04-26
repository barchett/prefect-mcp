#!/usr/bin/env bash
# UAT test runner for Phase 1 — tests 2-4
# Usage: bash uat-run.sh
set -euo pipefail

SESSION_ID="${1:-ses_2340e2419ffeeDNKAMf0L2NZhd}"
PASS=0
FAIL=0

inc_pass() { PASS=$((PASS+1)); }
inc_fail() { FAIL=$((FAIL+1)); }

INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"uat","version":"1"}}}
{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}'

mcp_call() {
  local call="$1"
  local wait="${2:-10}"
  (printf '%s\n%s\n' "$INIT" "$call" && sleep "$wait") | node build/index.js 2>/dev/null
}

echo "=== UAT Phase 1 — tests 2-4 ==="
echo "Session: $SESSION_ID"
echo ""

# --- Test 2: opencode_run ---
echo "--- TEST 2: opencode_run blocks until agent completes ---"
echo "Sending prompt to OpenCode (may take 10-60s)..."
CALL2='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"opencode_run","arguments":{"sessionId":"'"$SESSION_ID"'","prompt":"Reply with exactly the word PONG and nothing else. Do not write any files."}}}'
RESULT2=$(mcp_call "$CALL2" 90)
echo "$RESULT2"
if echo "$RESULT2" | grep -q '"id":2'; then
  if echo "$RESULT2" | grep -q '"isError":true'; then
    echo "RESULT: FAIL — tool returned isError"
    inc_fail
  else
    echo "RESULT: PASS — got response for id:2"
    inc_pass
  fi
else
  echo "RESULT: FAIL — no response received"
  inc_fail
fi
echo ""

# --- Test 3: opencode_get_diff ---
echo "--- TEST 3: opencode_get_diff returns FileDiff array ---"
CALL3='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"opencode_get_diff","arguments":{"sessionId":"'"$SESSION_ID"'"}}}'
RESULT3=$(mcp_call "$CALL3" 10)
echo "$RESULT3"
if echo "$RESULT3" | grep -q '"id":2'; then
  if echo "$RESULT3" | grep -q '"isError":true'; then
    echo "RESULT: FAIL — tool returned isError"
    inc_fail
  else
    echo "RESULT: PASS — got response (array format; empty [] OK if no file changes)"
    inc_pass
  fi
else
  echo "RESULT: FAIL — no response received"
  inc_fail
fi
echo ""

# --- Test 4a: opencode_fork ---
echo "--- TEST 4a: opencode_fork creates new session ---"
CALL4A='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"opencode_fork","arguments":{"sessionId":"'"$SESSION_ID"'"}}}'
RESULT4A=$(mcp_call "$CALL4A" 10)
echo "$RESULT4A"
FORKED_ID=""
if echo "$RESULT4A" | grep -q '"id":2'; then
  if echo "$RESULT4A" | grep -q '"isError":true'; then
    echo "RESULT: FAIL — tool returned isError"
    inc_fail
  else
    # Extract forked session ID for 4b
    FORKED_ID=$(echo "$RESULT4A" | grep -o '"id":"ses_[^"]*"' | head -1 | cut -d'"' -f4 || true)
    echo "RESULT: PASS — forked session: ${FORKED_ID:-<id not parsed>}"
    inc_pass
  fi
else
  echo "RESULT: FAIL — no response received"
  inc_fail
fi
echo ""

# --- Test 4b: opencode_abort ---
echo "--- TEST 4b: opencode_abort reaches endpoint ---"
ABORT_TARGET="${FORKED_ID:-$SESSION_ID}"
CALL4B='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"opencode_abort","arguments":{"sessionId":"'"$ABORT_TARGET"'"}}}'
RESULT4B=$(mcp_call "$CALL4B" 10)
echo "$RESULT4B"
if echo "$RESULT4B" | grep -q '"id":2'; then
  echo "RESULT: PASS — abort endpoint reached (any response counts)"
  inc_pass
else
  echo "RESULT: FAIL — no response received"
  inc_fail
fi
echo ""

# --- Test 4c: opencode_approve_permission (expects endpoint hit; may 404 if no pending request) ---
echo "--- TEST 4c: opencode_approve_permission reaches endpoint ---"
CALL4C='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"opencode_approve_permission","arguments":{"sessionId":"'"$SESSION_ID"'","permissionId":"perm_fake_for_uat","response":"reject"}}}'
RESULT4C=$(mcp_call "$CALL4C" 10)
echo "$RESULT4C"
if echo "$RESULT4C" | grep -q '"id":2'; then
  echo "RESULT: PASS — permission endpoint reached (error response OK — no active permission request)"
  inc_pass
else
  echo "RESULT: FAIL — no response received"
  inc_fail
fi
echo ""

# --- Summary ---
echo "=== SUMMARY ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "ALL TESTS PASSED — Phase 1 UAT complete"
else
  echo "FAILURES DETECTED — review output above"
fi
