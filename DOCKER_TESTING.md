# Docker Testing Setup for Playwright

## Problem

Playwright's WebKit browser fails on Arch Linux due to library incompatibilities (`libffi.so.7: version 'LIBFFI_BASE_7.0' not found`). The WebKit binary is built for Ubuntu 20.04, which has different system libraries.

## Solution

Use Docker to run tests in an Ubuntu 20.04 environment where all Playwright browsers work correctly, including WebKit/Safari.

## Quick Start

### Option 1: Using Docker Compose (Recommended)

```bash
# Run all tests (Chromium, Firefox, WebKit) in Docker
docker-compose run --rm playwright-tests

# Or use the helper script
./scripts/run-tests-docker.sh
```

### Option 2: Manual Docker Build and Run

```bash
# Build the Docker image
docker build -t editor-playwright .

# Run tests in the container
docker run --rm \
  -v $(pwd):/app \
  -v /app/node_modules \
  -p 8080:8080 \
  editor-playwright npm run test:pw
```

### Option 3: Run Specific Browsers

```bash
# Chromium only
docker-compose run --rm playwright-tests npx playwright test --project=chromium

# Firefox only
docker-compose run --rm playwright-tests npx playwright test --project=firefox

# WebKit only
docker-compose run --rm playwright-tests npx playwright test --project=webkit
```

## What's Included

### Docker Setup Files

- **Dockerfile**: Multi-stage build for optimal image size
  - Stage 1: Builder - installs dependencies and npm packages
  - Stage 2: Runtime - includes all Playwright browser dependencies
  - Pre-installs Chromium, Firefox, and WebKit browsers

- **docker-compose.yml**: Orchestrates the test environment
  - Mounts local directory
  - Exposes port 8080 for dev server
  - Isolates node_modules to avoid conflicts

- **.dockerignore**: Optimizes build context

- **scripts/run-tests-docker.sh**: Helper script for easy test running

## Local Testing (Without Docker)

If you're on a system where WebKit is already compatible:

```bash
# Comment out the WebKit project in playwright.config.js to skip it
# Or run specific browsers only
npm run test:pw -- --project=chromium --project=firefox
```

## GitHub Actions / CI/CD

For CI/CD pipelines, Docker is recommended:

```yaml
- name: Run Playwright Tests
  run: docker-compose run --rm playwright-tests
```

## Troubleshooting

### Docker Build Fails with Library Errors

Ensure your Docker installation has sufficient disk space and memory:

```bash
# Check Docker resources
docker system df
docker system info
```

### Tests Run Slowly in Docker

This is normal - emulation adds overhead. To speed up local development:

1. Use `--project=chromium` to run only Chromium during development
2. Use the native local setup for quick iteration
3. Run full tests (with WebKit) only before committing

### WebKit Tests Still Fail

Verify the Docker image includes WebKit:

```bash
docker run --rm editor-playwright npx playwright install --with-deps webkit
```

## Environment Variables

- `CI=true` - Enables CI mode (stricter settings)
- `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` - Skips re-downloading browsers

## Performance Notes

- **Build time**: ~3-5 minutes for first build (includes browser downloads)
- **Test time**: ~30-60 seconds depending on test suite size
- **Image size**: ~2-3 GB (includes all browsers and dependencies)

## References

- [Playwright Docker Guide](https://playwright.dev/docs/docker)
- [Playwright System Requirements](https://playwright.dev/docs/browsers#system-requirements)
