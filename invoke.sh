#!/usr/bin/env bash
set -euo pipefail

FUNCTION_NAME="ai-latencies"
REGION="${AWS_REGION:-us-east-1}"

# Build the Lambda event payload from args
# Usage: ./invoke.sh [path] [querystring]
# Examples:
#   ./invoke.sh /run "tests=llm:*&samples=2"
#   ./invoke.sh /
#   ./invoke.sh /teardown

PATH_ARG="${1:-/}"
QS="${2:-}"

METHOD="GET"
if [[ "$PATH_ARG" == "/teardown" ]]; then
  METHOD="POST"
fi

PAYLOAD=$(jq -n \
  --arg path "$PATH_ARG" \
  --arg qs "$QS" \
  --arg method "$METHOD" \
  '{
    rawPath: $path,
    rawQueryString: $qs,
    requestContext: {
      http: { method: $method, path: $path },
      requestId: "cli"
    },
    headers: {},
    queryStringParameters: (
      if $qs == "" then null
      else ($qs | split("&") | map(split("=") | {(.[0]): .[1]}) | add)
      end
    )
  }')

OUTFILE=$(mktemp)
trap 'rm -f "$OUTFILE"' EXIT

aws lambda invoke \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --payload "$PAYLOAD" \
  --cli-binary-format raw-in-base64-out \
  --cli-read-timeout 300 \
  --no-cli-pager \
  "$OUTFILE" >/dev/null 2>&1

jq -r '.body' "$OUTFILE" | jq .
