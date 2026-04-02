#!/usr/bin/env bash
set -euo pipefail

ITERATIONS=10
SAMPLES=10

SANDBOX_CSV="sandbox-raw.csv"
PROVIDER_CSV="provider-raw.csv"

SANDBOX_TESTS="e2b:coldstart,e2b:native-exec,e2b:agent-exec,e2b:agent-health,daytona:coldstart,daytona:native-exec,daytona:agent-exec,daytona:agent-health"
PROVIDER_TESTS="llm:anthropic-haiku,llm:anthropic-opus,llm:openai-mini,llm:openai,llm:openrouter-haiku,llm:openrouter-opus,llm:openrouter-openai-mini,llm:openrouter-openai"

invoke_run() {
  local tests="$1" samples="$2"
  local outfile=$(mktemp)
  local payload=$(jq -n \
    --arg tests "$tests" \
    --arg samples "$samples" \
    '{
      rawPath: "/run",
      rawQueryString: ("tests=" + $tests + "&samples=" + $samples + "&format=csv"),
      requestContext: { http: { method: "GET", path: "/run" }, requestId: "cli" },
      headers: {},
      queryStringParameters: { tests: $tests, samples: $samples, format: "csv" }
    }')

  aws lambda invoke \
    --function-name ai-latencies \
    --region us-east-1 \
    --payload "$payload" \
    --cli-binary-format raw-in-base64-out \
    --cli-read-timeout 300 \
    --no-cli-pager \
    "$outfile" >/dev/null 2>&1

  jq -r '.body' "$outfile"
  rm -f "$outfile"
}

invoke_teardown() {
  local outfile=$(mktemp)
  aws lambda invoke \
    --function-name ai-latencies \
    --region us-east-1 \
    --payload '{"rawPath":"/teardown","requestContext":{"http":{"method":"POST","path":"/teardown"},"requestId":"cli"},"headers":{}}' \
    --cli-binary-format raw-in-base64-out \
    --cli-read-timeout 300 \
    --no-cli-pager \
    "$outfile" >/dev/null 2>&1
  rm -f "$outfile"
}

echo "=== Sandbox tests: $ITERATIONS iterations x $SAMPLES samples ==="

HEADER_WRITTEN=false
for i in $(seq 1 $ITERATIONS); do
  echo -n "  [$i/$ITERATIONS] teardown..."
  invoke_teardown
  echo -n " running..."

  CSV=$(invoke_run "$SANDBOX_TESTS" "$SAMPLES")

  if [ "$HEADER_WRITTEN" = false ]; then
    echo "iteration,$(echo "$CSV" | head -1)" > "$SANDBOX_CSV"
    HEADER_WRITTEN=true
  fi

  echo "$CSV" | tail -n +2 | while IFS= read -r line; do
    [ -n "$line" ] && echo "$i,$line"
  done >> "$SANDBOX_CSV"

  echo " done"
done

echo ""
echo "=== Provider tests: $ITERATIONS iterations x $SAMPLES samples ==="

HEADER_WRITTEN=false
for i in $(seq 1 $ITERATIONS); do
  echo -n "  [$i/$ITERATIONS] running..."

  CSV=$(invoke_run "$PROVIDER_TESTS" "$SAMPLES")

  if [ "$HEADER_WRITTEN" = false ]; then
    echo "iteration,$(echo "$CSV" | head -1)" > "$PROVIDER_CSV"
    HEADER_WRITTEN=true
  fi

  echo "$CSV" | tail -n +2 | while IFS= read -r line; do
    [ -n "$line" ] && echo "$i,$line"
  done >> "$PROVIDER_CSV"

  echo " done"
done

echo ""
echo "Output:"
echo "  $SANDBOX_CSV ($(wc -l < "$SANDBOX_CSV") rows)"
echo "  $PROVIDER_CSV ($(wc -l < "$PROVIDER_CSV") rows)"
