#!/bin/bash

# Script to run Playwright tests in Docker
# Handles cross-browser testing with WebKit on systems where it's incompatible locally

set -e

echo "🐳 Building Docker image for Playwright tests..."
docker-compose build

echo ""
echo "🧪 Running Playwright tests in Docker (Chromium, Firefox, WebKit)..."
docker-compose run --rm playwright-tests

echo ""
echo "✅ Tests completed!"
echo ""
echo "📊 View HTML report:"
echo "   open test-results/index.html"
