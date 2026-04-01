#!/usr/bin/env bash
set -euo pipefail

FUNCTION_NAME="ai-latencies"
REGION="${AWS_REGION:-us-east-1}"
ROLE_ARN="arn:aws:iam::717589162638:role/ai-latencies-lambda"

echo "Building..."
npm run build --silent

echo "Packaging..."
mkdir -p dist
cp dist/index.mjs /tmp/index.mjs
cd /tmp && zip -j /tmp/ai-latencies.zip index.mjs && cd -

# Check if function exists
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" &>/dev/null; then
  echo "Updating function code..."
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file fileb:///tmp/ai-latencies.zip \
    --region "$REGION" \
    --no-cli-pager

  echo "Waiting for update..."
  aws lambda wait function-updated-v2 \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION"
else
  echo "Creating function..."
  aws lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime nodejs20.x \
    --handler index.handler \
    --role "$ROLE_ARN" \
    --zip-file fileb:///tmp/ai-latencies.zip \
    --timeout 300 \
    --memory-size 256 \
    --region "$REGION" \
    --no-cli-pager

  echo "Waiting for creation..."
  aws lambda wait function-active-v2 \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION"
fi

echo "Deployed."
rm -f /tmp/ai-latencies.zip /tmp/index.mjs
