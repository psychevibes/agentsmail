#!/bin/bash
# AgentsMail Stress Test Script
# Tests API endpoints under load

API="https://api.agentsmail.net"
RESULTS_FILE="stress-results.txt"

echo "=== AgentsMail Stress Test ===" | tee "$RESULTS_FILE"
echo "Started: $(date)" | tee -a "$RESULTS_FILE"
echo "" | tee -a "$RESULTS_FILE"

# ── 1. Create test account ──
echo "--- Creating test account ---" | tee -a "$RESULTS_FILE"
SIGNUP=$(curl -s -w "\n%{http_code} %{time_total}s" -X POST "$API/api/signup" \
  -H "Content-Type: application/json" \
  -d '{"email":"stresstest@test.com","password":"testpass123"}')

BODY=$(echo "$SIGNUP" | head -1)
META=$(echo "$SIGNUP" | tail -1)
API_KEY=$(echo "$BODY" | grep -o '"api_key":"[^"]*"' | cut -d'"' -f4)
echo "Signup: $META" | tee -a "$RESULTS_FILE"
echo "API Key: $API_KEY" | tee -a "$RESULTS_FILE"
echo "" | tee -a "$RESULTS_FILE"

if [ -z "$API_KEY" ]; then
  echo "ERROR: Failed to create account. Response: $BODY"
  exit 1
fi

# ── 2. Create multiple mailboxes ──
echo "--- Creating 5 mailboxes ---" | tee -a "$RESULTS_FILE"
MAILBOXES=()
for i in $(seq 1 5); do
  NAME="stress-bot-$i"
  RESULT=$(curl -s -w "\n%{time_total}" -X POST "$API/api/mailboxes" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    -d "{\"name\":\"$NAME\"}")
  TIME=$(echo "$RESULT" | tail -1)
  ADDR=$(echo "$RESULT" | head -1 | grep -o '"address":"[^"]*"' | cut -d'"' -f4)
  MAILBOXES+=("$ADDR")
  echo "  Created $ADDR in ${TIME}s" | tee -a "$RESULTS_FILE"
done
echo "" | tee -a "$RESULTS_FILE"

# ── 3. Concurrent API reads (simulates bots polling for new mail) ──
echo "--- Concurrent inbox checks (20 parallel requests) ---" | tee -a "$RESULTS_FILE"
TMPDIR=$(mktemp -d)
START=$(date +%s%N)

for i in $(seq 1 20); do
  ADDR=${MAILBOXES[$((i % 5))]}
  curl -s -o "$TMPDIR/resp_$i.txt" -w "%{http_code} %{time_total}s\n" \
    -H "Authorization: Bearer $API_KEY" \
    "$API/api/mailboxes/$ADDR/messages" > "$TMPDIR/time_$i.txt" &
done
wait

END=$(date +%s%N)
TOTAL_MS=$(( (END - START) / 1000000 ))

echo "  Total wall time: ${TOTAL_MS}ms for 20 concurrent requests" | tee -a "$RESULTS_FILE"
echo "  Individual response times:" | tee -a "$RESULTS_FILE"
for i in $(seq 1 20); do
  echo "    Request $i: $(cat $TMPDIR/time_$i.txt)" | tee -a "$RESULTS_FILE"
done
rm -rf "$TMPDIR"
echo "" | tee -a "$RESULTS_FILE"

# ── 4. Rapid-fire mailbox listing (simulates dashboard refreshes) ──
echo "--- Rapid mailbox list requests (10 sequential) ---" | tee -a "$RESULTS_FILE"
TOTAL=0
for i in $(seq 1 10); do
  TIME=$(curl -s -o /dev/null -w "%{time_total}" \
    -H "Authorization: Bearer $API_KEY" \
    "$API/api/mailboxes")
  echo "  Request $i: ${TIME}s" | tee -a "$RESULTS_FILE"
  TOTAL=$(echo "$TOTAL + $TIME" | bc)
done
AVG=$(echo "scale=3; $TOTAL / 10" | bc)
echo "  Average: ${AVG}s" | tee -a "$RESULTS_FILE"
echo "" | tee -a "$RESULTS_FILE"

# ── 5. Send emails (tests Mailgun integration) ──
echo "--- Send test emails (3 sends, checking rate limits) ---" | tee -a "$RESULTS_FILE"
ADDR=${MAILBOXES[0]}
for i in $(seq 1 3); do
  RESULT=$(curl -s -w "\n%{http_code} %{time_total}s" -X POST "$API/api/mailboxes/$ADDR/send" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    -d "{\"to\":\"stresstest@test.com\",\"subject\":\"Stress test $i\",\"text\":\"This is stress test email $i\"}")
  META=$(echo "$RESULT" | tail -1)
  BODY=$(echo "$RESULT" | head -1)
  echo "  Send $i: $META — $(echo $BODY | grep -o '"message":"[^"]*"' | cut -d'"' -f4)" | tee -a "$RESULTS_FILE"
done
echo "" | tee -a "$RESULTS_FILE"

# ── 6. Cleanup ──
echo "--- Cleanup: deleting test mailboxes ---" | tee -a "$RESULTS_FILE"
for ADDR in "${MAILBOXES[@]}"; do
  curl -s -o /dev/null -X DELETE \
    -H "Authorization: Bearer $API_KEY" \
    "$API/api/mailboxes/$ADDR"
  echo "  Deleted $ADDR" | tee -a "$RESULTS_FILE"
done

echo "" | tee -a "$RESULTS_FILE"
echo "=== Stress Test Complete ===" | tee -a "$RESULTS_FILE"
echo "Finished: $(date)" | tee -a "$RESULTS_FILE"
echo "Results saved to $RESULTS_FILE"
