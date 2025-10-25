#!/bin/bash

# Script to run Playwright tests in Docker
# Handles cross-browser testing with WebKit on systems where it's incompatible locally
#
# Usage: ./run-tests-docker.sh [test-file]
# Example: ./run-tests-docker.sh tests/e2e-pw/tests/ornament-basic.spec.js

set -e

TEST_FILE="${1:-}"

echo "🐳 Building Docker image for Playwright tests..."
DOCKER_BUILDKIT=0 docker build -t editor-playwright-tests .

echo ""
if [ -n "$TEST_FILE" ]; then
  echo "🧪 Running Playwright test: $TEST_FILE"
  docker run --rm \
    -v "$(pwd):/app" \
    -e CI=true \
    editor-playwright-tests \
    npx playwright test "$TEST_FILE" --reporter=line
else
  echo "🧪 Running all Playwright tests..."
  docker run --rm \
    -v "$(pwd):/app" \
    -e CI=true \
    editor-playwright-tests \
    npm run test:pw
fi

echo ""
echo "✅ Tests completed!"
