#!/bin/bash

BASE_URL="http://localhost:3001"
PASS=0
FAIL=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_step() { echo -e "\n${BLUE}▶ $1${NC}"; }
print_ok()   { echo -e "${GREEN}✓ $1${NC}"; PASS=$((PASS+1)); }
print_fail() { echo -e "${RED}✗ $1${NC}"; FAIL=$((FAIL+1)); }
print_data() { echo -e "${YELLOW}  $1${NC}"; }

# ─── 1. Health check ────────────────────────────────────────────────────────
print_step "Health check"
HEALTH=$(curl -s "$BASE_URL/health")
if echo "$HEALTH" | grep -q '"ok"'; then
  print_ok "Server is healthy"
else
  print_fail "Server not responding — is it running?"
  echo "  Response: $HEALTH"
  exit 1
fi

# ─── 2. Register / Login ─────────────────────────────────────────────────────
print_step "Register user"
REGISTER=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@test.com","password":"password123","name":"Test User"}')

TOKEN=$(echo "$REGISTER" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
  print_ok "Registered successfully"
  print_data "Token: ${TOKEN:0:40}..."
else
  print_data "User may already exist, trying login..."
  LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"testuser@test.com","password":"password123"}')
  TOKEN=$(echo "$LOGIN" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
  if [ -n "$TOKEN" ]; then
    print_ok "Logged in with existing user"
    print_data "Token: ${TOKEN:0:40}..."
  else
    print_fail "Could not register or login"
    echo "  Response: $REGISTER"
    exit 1
  fi
fi

# ─── 3. Create course ────────────────────────────────────────────────────────
print_step "Create course"
COURSE=$(curl -s -X POST "$BASE_URL/courses" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Test Course",
    "holes": [
      {"number":1,"par":4,"distance":445},
      {"number":2,"par":5,"distance":575},
      {"number":3,"par":4,"distance":350},
      {"number":4,"par":3,"distance":240},
      {"number":5,"par":4,"distance":455}
    ]
  }')

COURSE_ID=$(echo "$COURSE" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)

if [ -n "$COURSE_ID" ]; then
  print_ok "Course created (id: $COURSE_ID)"
else
  print_fail "Failed to create course"
  echo "  Response: $COURSE"
  exit 1
fi

# ─── 4. Search for course ────────────────────────────────────────────────────
print_step "Search for course"
SEARCH=$(curl -s "$BASE_URL/courses?search=test")
if echo "$SEARCH" | grep -q "Test Course"; then
  print_ok "Course found in search"
else
  print_fail "Course not found in search"
  echo "  Response: $SEARCH"
fi

# ─── 5. Get course by ID ─────────────────────────────────────────────────────
print_step "Get course by ID"
GET_COURSE=$(curl -s "$BASE_URL/courses/$COURSE_ID")
if echo "$GET_COURSE" | grep -q "Test Course"; then
  print_ok "Course retrieved"
else
  print_fail "Failed to get course"
  echo "  Response: $GET_COURSE"
fi

# ─── 6. Start a round ────────────────────────────────────────────────────────
print_step "Start a round"
ROUND=$(curl -s -X POST "$BASE_URL/rounds" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"courseId\":$COURSE_ID}")

ROUND_ID=$(echo "$ROUND" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)

if [ -n "$ROUND_ID" ]; then
  print_ok "Round started (id: $ROUND_ID)"
else
  print_fail "Failed to start round"
  echo "  Response: $ROUND"
  exit 1
fi

# ─── 7. Score holes ──────────────────────────────────────────────────────────
print_step "Score holes"

# Extract hole IDs from the holes array in the course response
HOLES_JSON=$(echo "$GET_COURSE" | grep -o '"holes":\[.*\]' | grep -o '"id":[0-9]*' | cut -d':' -f2)
STROKES_LIST=(5 6 4 3 5)
i=0

for HOLE_ID in $HOLES_JSON; do
  STROKES_VAL=${STROKES_LIST[$i]}
  SCORE=$(curl -s -X PUT "$BASE_URL/rounds/$ROUND_ID/holes/$HOLE_ID" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    --data-raw "{\"strokes\":$STROKES_VAL}")

  if echo "$SCORE" | grep -q '"strokes"'; then
    print_ok "Hole $((i+1)) scored: $STROKES_VAL strokes"
  else
    print_fail "Failed to score hole $((i+1))"
    echo "  Response: $SCORE"
  fi
  i=$((i+1))
done

# ─── 8. Round history ────────────────────────────────────────────────────────
print_step "Round history"
HISTORY=$(curl -s "$BASE_URL/rounds" \
  -H "Authorization: Bearer $TOKEN")

if echo "$HISTORY" | grep -q '"totalStrokes"'; then
  TOTAL=$(echo "$HISTORY" | grep -o '"totalStrokes":[0-9]*' | head -1 | cut -d':' -f2)
  TO_PAR=$(echo "$HISTORY" | grep -o '"scoreToPar":-*[0-9]*' | head -1 | cut -d':' -f2)
  print_ok "History retrieved"
  print_data "Total strokes: $TOTAL | Score to par: $TO_PAR"
else
  print_fail "Failed to get history"
  echo "  Response: $HISTORY"
fi

# ─── 9. Stats ────────────────────────────────────────────────────────────────
print_step "Stats"
STATS=$(curl -s "$BASE_URL/rounds/stats" \
  -H "Authorization: Bearer $TOKEN")

if echo "$STATS" | grep -q '"roundsPlayed"'; then
  ROUNDS_PLAYED=$(echo "$STATS" | grep -o '"roundsPlayed":[0-9]*' | cut -d':' -f2)
  AVG=$(echo "$STATS" | grep -o '"averageScoreToPar":-*[0-9.]*' | cut -d':' -f2)
  print_ok "Stats retrieved"
  print_data "Rounds played: $ROUNDS_PLAYED | Average score to par: $AVG"
else
  print_fail "Failed to get stats"
  echo "  Response: $STATS"
fi

# ─── 10. Auth guard check ────────────────────────────────────────────────────
print_step "Auth guard (should reject request with no token)"
NO_AUTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/rounds")
if [ "$NO_AUTH" = "401" ]; then
  print_ok "Correctly rejected unauthenticated request (401)"
else
  print_fail "Auth guard not working (got $NO_AUTH, expected 401)"
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
echo -e "\n─────────────────────────────────"
echo -e "${GREEN}Passed: $PASS${NC} | ${RED}Failed: $FAIL${NC}"
echo "─────────────────────────────────"
